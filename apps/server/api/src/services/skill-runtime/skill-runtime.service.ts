import { isTrustedProductSkill } from '@api/collections/skills/constants/skill-validation.constant';
import { SkillLibraryService } from '@api/collections/skills/services/skill-library.service';
import {
  type ResolveBrandSkillsOptions,
  type ResolvedBrandSkill,
  SkillsService,
} from '@api/collections/skills/services/skills.service';
import {
  normalizeRequestedSkillSlugs,
  unavailableRequestedSkill,
} from '@api/collections/skills/utils/requested-skill-slugs.util';
import { isEntityId } from '@api/helpers/validation/entity-id.validator';
import {
  sanitizeAgentUntrustedInput,
  UNTRUSTED_ORG_SKILL_FRAMING,
} from '@api/services/agent-orchestrator/utils/agent-untrusted-content.util';
import type {
  PinnedRuntimeSkill,
  ResolveActiveSkillsContext,
  ResolvedRuntimeSkill,
} from '@genfeedai/contracts/interfaces/ai';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable, Optional } from '@nestjs/common';

/** Legacy truncation limit for optional skill instructions. */
export const MAX_INSTRUCTIONS_PER_SKILL = 24_000;
export const MAX_TOTAL_SKILL_INSTRUCTIONS = 48_000;

@Injectable()
export class SkillRuntimeService {
  constructor(
    private readonly skillsService: SkillsService,
    private readonly logger: LoggerService,
    @Optional() private readonly skillLibrary?: SkillLibraryService,
  ) {}

  /**
   * Canonical resolution path for runtime skill loading.
   * All consumers (orchestrator, agent-spawn, profile-resolver) must use this.
   */
  async resolveActiveSkills(
    organizationId: string,
    brandId: string,
    strategySkillSlugs?: string[],
    context: ResolveActiveSkillsContext = {},
  ): Promise<ResolvedRuntimeSkill[]> {
    const options: ResolveBrandSkillsOptions = {
      agentType: context.agentType,
      channel: context.channel,
      fallbackToDefaultCatalog: true,
      modality: context.modality,
      requestedSlugs: context.requestedSkillSlugs,
      workflowStage: context.workflowStage,
    };

    const brandSkills = await this.keepAuthorizedSkills(
      organizationId,
      brandId,
      context,
      await this.skillsService.resolveBrandSkills(organizationId, brandId, {
        ...options,
        ...(context.actorUserId ? { actorUserId: context.actorUserId } : {}),
      }),
    );

    if (brandSkills.length === 0) {
      return [];
    }

    const filtered = this.applyStrategyPriority(
      brandSkills,
      strategySkillSlugs,
    );

    return filtered.map((resolved) => this.toRuntimeSkill(resolved));
  }

  /**
   * Skill instructions for slugs the operator picked in a composer.
   *
   * Legacy requested-only formatting for non-generation callers. Failures
   * return an empty string so the caller can keep its base system prompt.
   */
  async resolveRequestedSkillPromptSections(
    organizationId: string,
    brandId: string | null | undefined,
    requestedSkillSlugs: string[] | undefined,
  ): Promise<string> {
    if (!requestedSkillSlugs?.length || !isEntityId(brandId)) {
      return '';
    }

    try {
      const skills = await this.resolveActiveSkills(
        organizationId,
        brandId,
        undefined,
        { requestedSkillSlugs },
      );
      return this.buildSkillPromptSections(
        skills.filter((skill) => requestedSkillSlugs.includes(skill.slug)),
      );
    } catch (error) {
      this.logger.error(
        'Failed to resolve requested skill prompt sections',
        error,
      );
      return '';
    }
  }

  /**
   * Formats skill instructions as system prompt sections.
   * First-party/built-in skills are trusted product content and are not framed
   * as untrusted org input. Org-custom / imported / customized forks stay
   * sanitized and framed. Enforces per-skill and total character limits.
   */
  async resolveGenerationSkillPromptSections(
    organizationId: string,
    brandId: string | null | undefined,
    requestedSkillSlugs: string[] | undefined,
    context: ResolveActiveSkillsContext = {},
  ): Promise<string> {
    const requested = normalizeRequestedSkillSlugs(requestedSkillSlugs);
    if (!isEntityId(brandId)) {
      if (requested?.length) throw unavailableRequestedSkill();
      return '';
    }

    if (!requested?.length) {
      // No skill was explicitly selected: a transient resolver failure must
      // not abort media enhancement. Only a configuration error (duplicate
      // skill slugs) is surfaced; anything else is logged and tolerated.
      try {
        const skills = await this.resolveActiveSkills(
          organizationId,
          brandId,
          undefined,
          { ...context, requestedSkillSlugs: requested },
        );
        return this.buildSkillPromptSections(skills, requested);
      } catch (error) {
        if (error instanceof BadRequestException) throw error;
        this.logger.error(
          'Failed to resolve skill prompt sections with no skills selected; continuing without skill sections',
          error,
          'SkillRuntimeService',
        );
        return '';
      }
    }

    const skills = await this.resolveActiveSkills(
      organizationId,
      brandId,
      undefined,
      {
        ...context,
        requestedSkillSlugs: requested,
      },
    );
    return this.buildSkillPromptSections(skills, requested);
  }

  async collectAuthorizedPins(input: {
    actorUserId?: string;
    brandId?: string | null;
    modality: string;
    organizationId: string;
    requestedSkillSlugs?: string[];
  }): Promise<PinnedRuntimeSkill[]> {
    const pins: PinnedRuntimeSkill[] = [];
    if (!input.actorUserId || !input.requestedSkillSlugs?.length) return pins;
    await this.resolveGenerationSkillPromptSections(
      input.organizationId,
      input.brandId,
      input.requestedSkillSlugs,
      {
        actorUserId: input.actorUserId,
        modality: input.modality,
        pinnedSkills: pins,
      },
    );
    return pins;
  }

  async applyAuthorizedSkillPrompt(input: {
    actorUserId?: string;
    brandId?: string | null;
    modality: string;
    organizationId: string;
    pinnedSkills?: PinnedRuntimeSkill[];
    prompt: string;
    requestedSkillSlugs?: string[];
  }): Promise<string> {
    const requested = normalizeRequestedSkillSlugs(input.requestedSkillSlugs);
    if (!requested?.length) return input.prompt;
    const sections = await this.resolveGenerationSkillPromptSections(
      input.organizationId,
      input.brandId,
      requested,
      {
        actorUserId: input.actorUserId,
        modality: input.modality,
        ...(input.pinnedSkills ? { pinnedSkills: input.pinnedSkills } : {}),
      },
    );
    return sections ? `${sections}\n\n${input.prompt}` : input.prompt;
  }

  async recordPromptEvidence(input: {
    actorUserId?: string;
    brandId?: string | null;
    organizationId: string;
    prompt: string;
  }): Promise<void> {
    if (!input.actorUserId || !this.skillLibrary) return;
    try {
      await this.skillLibrary.recordPromptSnapshot({
        actor: {
          brandId: input.brandId,
          organizationId: input.organizationId,
          userId: input.actorUserId,
        },
        prompt: input.prompt,
      });
    } catch (error) {
      this.logger.error(
        'Failed to record the generation prompt snapshot',
        error,
      );
    }
  }

  buildSkillPromptSections(
    skills: ResolvedRuntimeSkill[],
    requiredSlugs: string[] = [],
  ): string {
    if (
      requiredSlugs.some((slug) => !skills.some((skill) => skill.slug === slug))
    )
      throw unavailableRequestedSkill();
    if (skills.length === 0) return '';
    const required = new Set(requiredSlugs);
    const included = new Set<string>();

    const trustedSections: string[] = [];
    const untrustedSections: string[] = [];
    let totalLength = 0;

    const orderedSkills = required.size
      ? [...skills].sort(
          (left, right) =>
            Number(required.has(right.slug)) - Number(required.has(left.slug)),
        )
      : skills;
    for (const skill of orderedSkills) {
      if (!skill.instructions) {
        if (required.has(skill.slug)) throw unavailableRequestedSkill();
        continue;
      }

      const isTrusted = isTrustedProductSkill(skill);
      const preparedInstructions = isTrusted
        ? skill.instructions.trim()
        : sanitizeAgentUntrustedInput(
            skill.instructions,
            required.has(skill.slug) ? Number.POSITIVE_INFINITY : undefined,
          );
      if (!preparedInstructions) {
        if (required.has(skill.slug)) throw unavailableRequestedSkill();
        continue;
      }

      const wasTruncated =
        !required.has(skill.slug) &&
        preparedInstructions.length > MAX_INSTRUCTIONS_PER_SKILL;
      const truncated = wasTruncated
        ? `${preparedInstructions.slice(0, MAX_INSTRUCTIONS_PER_SKILL)}…`
        : preparedInstructions;

      if (wasTruncated) {
        this.logger.warn(
          `Skill ${skill.slug} instructions truncated at ${MAX_INSTRUCTIONS_PER_SKILL} chars`,
          'SkillRuntimeService',
        );
      }

      const section = `## Skill: ${skill.name}\n${truncated}`;

      const candidateLength = required.size
        ? this.renderSkillSections(
            isTrusted ? [...trustedSections, section] : trustedSections,
            isTrusted ? untrustedSections : [...untrustedSections, section],
          ).length
        : totalLength + section.length;
      if (candidateLength > MAX_TOTAL_SKILL_INSTRUCTIONS) {
        if (required.has(skill.slug)) {
          throw new BadRequestException(
            'The selected skill instructions exceed the generation budget. Select fewer skills or shorten their instructions.',
          );
        }
        this.logger.warn(
          `Skill prompt sections truncated at ${trustedSections.length + untrustedSections.length} skills (total limit ${MAX_TOTAL_SKILL_INSTRUCTIONS} chars)`,
          'SkillRuntimeService',
        );
        if (required.size) continue;
        break;
      }

      if (isTrusted) {
        trustedSections.push(section);
      } else {
        untrustedSections.push(section);
      }
      included.add(skill.slug);
      totalLength += section.length;
    }

    if (requiredSlugs.some((slug) => !included.has(slug)))
      throw unavailableRequestedSkill();
    return this.renderSkillSections(trustedSections, untrustedSections);
  }

  private renderSkillSections(
    trustedSections: string[],
    untrustedSections: string[],
  ): string {
    const blocks: string[] = [];

    if (trustedSections.length > 0) {
      blocks.push(trustedSections.join('\n\n'));
    }

    if (untrustedSections.length > 0) {
      blocks.push(
        `${UNTRUSTED_ORG_SKILL_FRAMING}\n\n${untrustedSections.join('\n\n')}`,
      );
    }

    return blocks.join('\n\n');
  }

  /**
   * Merges skill tool overrides into the base tool set (additive only).
   * When baseTools is undefined (no agentType), returns undefined to
   * preserve unrestricted toolset — skill overrides are not needed
   * when all tools are already available.
   * Invalid tool names are logged and dropped.
   */
  mergeSkillToolOverrides(
    baseTools: string[] | undefined,
    skills: ResolvedRuntimeSkill[],
  ): string[] | undefined {
    if (!baseTools) {
      return undefined;
    }

    const toolSet = new Set(baseTools);

    for (const skill of skills) {
      for (const tool of skill.toolOverrides) {
        if (!toolSet.has(tool)) {
          toolSet.add(tool);
        }
      }
    }

    return [...toolSet];
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private async keepAuthorizedSkills(
    organizationId: string,
    brandId: string,
    context: ResolveActiveSkillsContext,
    skills: ResolvedBrandSkill[],
  ): Promise<ResolvedBrandSkill[]> {
    if (!context.actorUserId || !this.skillLibrary) return skills;
    const actor = {
      brandId,
      organizationId,
      userId: context.actorUserId,
    };
    const idBySlug = new Map(
      skills.map((skill) => [String(skill.skill.slug), String(skill.skill.id)]),
    );
    const pins = (context.pinnedSkills ?? [])
      .filter((pin) => pin.versionId.length > 0)
      .map((pin) => ({
        contentHash: pin.contentHash,
        skillId: idBySlug.get(pin.slug) ?? pin.slug,
        skillVersionId: pin.versionId,
      }));
    const decision = await this.skillLibrary.authorizeResolved(
      actor,
      skills.map((skill) => skill.skill),
      context.pinnedSkills && context.pinnedSkills.length > 0 ? pins : [],
    );
    await this.skillLibrary.recordResolution(
      actor,
      decision.versions,
      decision.excluded,
    );
    const allowed = new Map(
      decision.included.map((document) => [String(document.id), document]),
    );
    const kept = skills.flatMap((skill) => {
      const bound = allowed.get(String(skill.skill.id));
      if (!bound) return [];
      return [{ ...skill, skill: bound, targetSkill: bound }];
    });
    if (context.pinnedSkills && context.pinnedSkills.length === 0) {
      for (const skill of kept) {
        const runtime = this.toRuntimeSkill(skill);
        if (!runtime.versionId || !runtime.contentHash) continue;
        context.pinnedSkills.push({
          contentHash: runtime.contentHash,
          instructions: runtime.instructions,
          slug: runtime.slug,
          versionId: runtime.versionId,
        });
      }
    }
    return kept;
  }

  private applyStrategyPriority(
    brandSkills: ResolvedBrandSkill[],
    strategySkillSlugs?: string[],
  ): ResolvedBrandSkill[] {
    if (!strategySkillSlugs || strategySkillSlugs.length === 0) {
      return brandSkills;
    }

    const slugSet = new Set(strategySkillSlugs);

    return [...brandSkills].sort(
      (left, right) =>
        Number(slugSet.has(String(right.skill.slug))) -
        Number(slugSet.has(String(left.skill.slug))),
    );
  }

  private toRuntimeSkill(resolved: ResolvedBrandSkill): ResolvedRuntimeSkill {
    const skill = resolved.targetSkill ?? resolved.skill;
    const maybeDoc = skill as typeof skill & {
      toObject?: () => typeof skill;
    };
    const doc =
      typeof maybeDoc.toObject === 'function' ? maybeDoc.toObject() : skill;
    const slug = this.readString(doc.slug) ?? String(doc.id);
    const source = this.readString(doc.source);

    return {
      contentHash: this.readString(doc.contentHash),
      instructions:
        this.readString(doc.systemPromptTemplate) ??
        this.readString(doc.defaultInstructions) ??
        '',
      isBuiltIn: doc.isBuiltIn === true,
      name: this.readString(doc.name) ?? slug,
      versionId: this.readString(doc.skillVersionId),
      slug,
      source:
        source === 'built_in' ||
        source === 'custom' ||
        source === 'customized' ||
        source === 'imported'
          ? source
          : undefined,
      toolOverrides: (doc.toolOverrides as string[] | undefined) ?? [],
    };
  }
}
