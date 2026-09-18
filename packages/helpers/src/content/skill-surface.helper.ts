import { ContentSkillCategory, SkillSurface } from '@genfeedai/contracts';

/**
 * The persisted taxonomy fields a surface can be derived from. Every field is
 * optional because custom and imported skills are only partially tagged, and
 * rows provisioned before `surfaces` existed carry none of it.
 */
export interface SkillSurfaceInput {
  category?: string | null;
  modalities?: readonly string[] | null;
  /** Explicit override persisted on the skill; wins over every inference. */
  surfaces?: readonly string[] | null;
  workflowStage?: string | null;
}

const ALL_SURFACES: readonly SkillSurface[] = [
  SkillSurface.AGENT,
  SkillSurface.STUDIO,
];

/** Modalities Studio can actually generate. `multi` spans both surfaces. */
const STUDIO_MODALITIES = new Set(['audio', 'image', 'multi', 'video']);

/** Categories that are about producing a Studio asset, whatever the modality. */
const STUDIO_CATEGORIES = new Set<string>([
  ContentSkillCategory.AUDIO,
  ContentSkillCategory.IMAGE,
  ContentSkillCategory.VIDEO,
]);

/**
 * Stages that only make sense in a conversation: they reason about a body of
 * work rather than produce one frame of it.
 */
const AGENT_ONLY_STAGES = new Set([
  'analysis',
  'planning',
  'publishing',
  'research',
]);

export function isSkillSurface(value: unknown): value is SkillSurface {
  return ALL_SURFACES.includes(value as SkillSurface);
}

export function parseSkillSurface(value: unknown): SkillSurface | null {
  return isSkillSurface(value) ? value : null;
}

function readExplicitSurfaces(
  surfaces: readonly string[] | null | undefined,
): SkillSurface[] | null {
  if (!surfaces?.length) {
    return null;
  }

  const parsed = surfaces.filter(isSkillSurface);

  return parsed.length > 0 ? [...new Set(parsed)] : null;
}

/**
 * Which composer surfaces should offer this skill under `/`.
 *
 * Agent is the generalist surface and is always included — a skill that never
 * appears anywhere is worse than one that appears in the chat as well. Studio
 * is additive: it is offered only when the skill produces, or shapes, a
 * generated asset.
 */
export function resolveSkillSurfaces(skill: SkillSurfaceInput): SkillSurface[] {
  const explicit = readExplicitSurfaces(skill.surfaces);
  if (explicit) {
    return explicit;
  }

  const modalities = skill.modalities ?? [];
  const isStudioModality = modalities.some((modality) =>
    STUDIO_MODALITIES.has(modality),
  );
  const isStudioCategory = STUDIO_CATEGORIES.has(skill.category ?? '');
  const isAgentOnlyStage = AGENT_ONLY_STAGES.has(skill.workflowStage ?? '');

  if ((isStudioModality || isStudioCategory) && !isAgentOnlyStage) {
    return [SkillSurface.AGENT, SkillSurface.STUDIO];
  }

  return [SkillSurface.AGENT];
}

export function isSkillOnSurface(
  skill: SkillSurfaceInput,
  surface: SkillSurface,
): boolean {
  return resolveSkillSurfaces(skill).includes(surface);
}
