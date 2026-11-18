/**
 * Skill arms for `--suite=skill-ab`: the instructions a skill puts in front of
 * the model, loaded from a local skill directory so two skill packs can be
 * compared on one fixture without either being copied into this repository.
 *
 * A skill is read the way the product injects one: the body of its `SKILL.md`
 * without the YAML frontmatter, cut at the per-skill instruction limit. Files a
 * skill links to (`references/`, scripts) are not loaded, so an arm measures the
 * instructions an agent has in context when the skill triggers.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Contestant } from '../contracts';
import { sha256Digest } from '../provenance';

/** Mirrors `MAX_INSTRUCTIONS_PER_SKILL` in the API's skill runtime. */
export const MAX_SKILL_INSTRUCTION_CHARS = 24_000;

/** The label that names the control arm: same brand rules, no skill. */
export const NO_SKILL_LABEL = 'none';

const ARM_LABEL_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const FRONTMATTER_PATTERN = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

export interface SkillArmSpec {
  /** Skill directory (holds `SKILL.md`); null for the no-skill control. */
  directory: string | null;
  label: string;
}

export interface LoadedSkill {
  /** Characters dropped by the instruction limit. */
  droppedChars: number;
  digest: string;
  prompt: string;
}

/**
 * `--skill-arms=genfeed=<dir>,other=<dir>,none`: two or more comma-separated
 * arms, the first being the baseline. `label=<dir>` loads a skill; the bare
 * label `none` is the control with no skill.
 */
export function parseSkillArms(flag: string | undefined): SkillArmSpec[] {
  const entries = (flag ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (entries.length < 2) {
    throw new Error(
      '--skill-arms needs at least two arms, baseline first: label=<skill dir>,...,none',
    );
  }

  const arms = entries.map((entry): SkillArmSpec => {
    const separator = entry.indexOf('=');
    const label = (separator === -1 ? entry : entry.slice(0, separator)).trim();
    const directory = separator === -1 ? '' : entry.slice(separator + 1).trim();
    if (!ARM_LABEL_PATTERN.test(label)) {
      throw new Error(
        `--skill-arms label "${label}" must be lowercase letters, digits and dashes`,
      );
    }
    if (label === NO_SKILL_LABEL) {
      if (directory) {
        throw new Error(
          `--skill-arms: "${NO_SKILL_LABEL}" is the control and takes no directory`,
        );
      }
      return { directory: null, label };
    }
    if (!directory) {
      throw new Error(
        `--skill-arms: arm "${label}" needs a skill directory (${label}=<dir>)`,
      );
    }
    return { directory, label };
  });

  if (new Set(arms.map((arm) => arm.label)).size !== arms.length) {
    throw new Error('--skill-arms repeats a label');
  }

  return arms;
}

export function stripFrontmatter(markdown: string): string {
  return markdown.replace(FRONTMATTER_PATTERN, '').trim();
}

export function loadSkill(directory: string): LoadedSkill {
  const path = join(directory, 'SKILL.md');
  let markdown: string;
  try {
    markdown = readFileSync(path, 'utf8');
  } catch (error: unknown) {
    throw new Error(
      `cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const body = stripFrontmatter(markdown);
  if (body.length === 0) {
    throw new Error(`${path} has no instructions after its frontmatter`);
  }

  return {
    droppedChars: Math.max(0, body.length - MAX_SKILL_INSTRUCTION_CHARS),
    digest: sha256Digest(markdown),
    prompt: body.slice(0, MAX_SKILL_INSTRUCTION_CHARS),
  };
}

export function buildSkillContestants(
  model: string,
  arms: SkillArmSpec[],
  load: (directory: string) => LoadedSkill = loadSkill,
): Contestant[] {
  return arms.map((arm) => ({
    guidanceArm: 'skill',
    id: `${model}#skill:${arm.label}`,
    isCompiled: false,
    registryKey: model,
    ...(arm.directory ? { skillPrompt: load(arm.directory).prompt } : {}),
  }));
}
