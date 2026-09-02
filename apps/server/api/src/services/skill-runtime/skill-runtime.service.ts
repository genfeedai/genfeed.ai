import { isTrustedProductSkill } from '@api/collections/skills/constants/skill-validation.constant';
import {
  type ResolveBrandSkillsOptions,
  type ResolvedBrandSkill,
  SkillsService,
} from '@api/collections/skills/services/skills.service';
import {
  sanitizeAgentUntrustedInput,
  UNTRUSTED_ORG_SKILL_FRAMING,
} from '@api/services/agent-orchestrator/utils/agent-untrusted-content.util';
import type {
  ResolveActiveSkillsContext,
  ResolvedRuntimeSkill,
} from '@genfeedai/interfaces/ai';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

/** Real SKILL.md files (image-prompt-engineer is ~20k) need room to be useful. */
export const MAX_INSTRUCTIONS_PER_SKILL = 24_000;
export const MAX_TOTAL_SKILL_INSTRUCTIONS = 48_000;

@Injectable()
export class SkillRuntimeService {
  constructor(
    private readonly skillsService: SkillsService,
    private readonly logger: LoggerService,
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
      workflowStage: context.workflowStage,
    };

    const brandSkills = await this.skillsService.resolveBrandSkills(
      organizationId,
      brandId,
      options,
    );

    if (brandSkills.length === 0) {
      return [];
    }

    const filtered = this.applyStrategyFilter(brandSkills, strategySkillSlugs);

    return filtered.map((resolved) => this.toRuntimeSkill(resolved));
  }

  /**
   * Formats skill instructions as system prompt sections.
   * First-party/built-in skills are trusted product content and are not framed
   * as untrusted org input. Org-custom / imported / customized forks stay
   * sanitized and framed. Enforces per-skill and total character limits.
   */
  buildSkillPromptSections(skills: ResolvedRuntimeSkill[]): string {
    if (skills.length === 0) {
      return '';
    }

    const trustedSections: string[] = [];
    const untrustedSections: string[] = [];
    let totalLength = 0;

    for (const skill of skills) {
      if (!skill.instructions) {
        continue;
      }

      const isTrusted = isTrustedProductSkill(skill);
      const preparedInstructions = isTrusted
        ? skill.instructions
        : sanitizeAgentUntrustedInput(skill.instructions);
      if (!preparedInstructions) {
        continue;
      }

      const wasTruncated =
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

      if (totalLength + section.length > MAX_TOTAL_SKILL_INSTRUCTIONS) {
        this.logger.warn(
          `Skill prompt sections truncated at ${trustedSections.length + untrustedSections.length} skills (total limit ${MAX_TOTAL_SKILL_INSTRUCTIONS} chars)`,
          'SkillRuntimeService',
        );
        break;
      }

      if (isTrusted) {
        trustedSections.push(section);
      } else {
        untrustedSections.push(section);
      }
      totalLength += section.length;
    }

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

  private applyStrategyFilter(
    brandSkills: ResolvedBrandSkill[],
    strategySkillSlugs?: string[],
  ): ResolvedBrandSkill[] {
    if (!strategySkillSlugs || strategySkillSlugs.length === 0) {
      return brandSkills;
    }

    const slugSet = new Set(strategySkillSlugs);

    return brandSkills.filter((resolved) => {
      const slug = resolved.skill.slug;
      return typeof slug === 'string' && slugSet.has(slug);
    });
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
      instructions:
        this.readString(doc.systemPromptTemplate) ??
        this.readString(doc.defaultInstructions) ??
        '',
      isBuiltIn: doc.isBuiltIn === true,
      name: this.readString(doc.name) ?? slug,
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
