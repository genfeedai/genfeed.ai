import {
  type ResolvedBrandSkill,
  SkillsService,
} from '@api/collections/skills/services/skills.service';
import type { ResolvedRuntimeSkill } from '@genfeedai/interfaces/ai';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

const MAX_INSTRUCTIONS_PER_SKILL = 2000;
const MAX_TOTAL_SKILL_INSTRUCTIONS = 8000;

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
  ): Promise<ResolvedRuntimeSkill[]> {
    const brandSkills = await this.skillsService.resolveBrandSkills(
      organizationId,
      brandId,
    );

    if (brandSkills.length === 0) {
      return [];
    }

    const filtered = this.applyStrategyFilter(brandSkills, strategySkillSlugs);

    return filtered.map((resolved) => this.toRuntimeSkill(resolved));
  }

  /**
   * Formats skill instructions as system prompt sections.
   * Enforces per-skill and total character limits.
   */
  buildSkillPromptSections(skills: ResolvedRuntimeSkill[]): string {
    if (skills.length === 0) {
      return '';
    }

    const sections: string[] = [];
    let totalLength = 0;

    for (const skill of skills) {
      if (!skill.instructions) {
        continue;
      }

      const truncated =
        skill.instructions.length > MAX_INSTRUCTIONS_PER_SKILL
          ? `${skill.instructions.slice(0, MAX_INSTRUCTIONS_PER_SKILL)}…`
          : skill.instructions;

      const section = `## Skill: ${skill.name}\n${truncated}`;

      if (totalLength + section.length > MAX_TOTAL_SKILL_INSTRUCTIONS) {
        this.logger.warn(
          `Skill prompt sections truncated at ${sections.length} skills (total limit ${MAX_TOTAL_SKILL_INSTRUCTIONS} chars)`,
          'SkillRuntimeService',
        );
        break;
      }

      sections.push(section);
      totalLength += section.length;
    }

    return sections.join('\n\n');
  }

  /**
   * Merges skill tool overrides into the base tool set (additive only).
   * Invalid tool names are logged and dropped.
   */
  mergeSkillToolOverrides(
    baseTools: string[],
    skills: ResolvedRuntimeSkill[],
  ): string[] {
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

  private applyStrategyFilter(
    brandSkills: ResolvedBrandSkill[],
    strategySkillSlugs?: string[],
  ): ResolvedBrandSkill[] {
    if (!strategySkillSlugs || strategySkillSlugs.length === 0) {
      return brandSkills;
    }

    const slugSet = new Set(strategySkillSlugs);

    return brandSkills.filter((resolved) => slugSet.has(resolved.skill.slug));
  }

  private toRuntimeSkill(resolved: ResolvedBrandSkill): ResolvedRuntimeSkill {
    const skill = resolved.targetSkill ?? resolved.skill;
    const doc = skill.toObject ? skill.toObject() : skill;

    return {
      instructions:
        (doc.systemPromptTemplate as string | undefined) ??
        doc.defaultInstructions ??
        '',
      name: doc.name,
      slug: doc.slug,
      toolOverrides: (doc.toolOverrides as string[] | undefined) ?? [],
    };
  }
}
