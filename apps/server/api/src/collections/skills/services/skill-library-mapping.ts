import type { CreateScopedSkillDto } from '@api/collections/skills/dto/skill-library.dto';
import type {
  resolveSkillCapabilities,
  SkillAudience,
  SkillCapabilitySubject,
  SkillOwnerKind,
} from '@api/collections/skills/policy/skill-capabilities';
import type { SkillDocument } from '@api/collections/skills/schemas/skill.schema';
import type { SkillRow } from '@api/collections/skills/services/skill-library.types';
import type { Prisma } from '@genfeedai/prisma';

export function defaultAudience(
  ownerKind: SkillOwnerKind,
  requested?: SkillAudience,
): SkillAudience {
  if (requested) return requested;
  return ownerKind === 'user' ? 'private' : 'organization';
}

export function configFromInput(
  input: CreateScopedSkillDto,
): Record<string, unknown> {
  return {
    category: input.category ?? 'content',
    channels: input.channels ?? ['general'],
    defaultInstructions: input.instructions,
    description: input.description,
    isBuiltIn: false,
    isEnabled: true,
    modalities: input.modalities ?? ['text'],
    name: input.name,
    slug: input.slug,
    source: 'custom',
    status: 'draft',
    systemPromptTemplate: input.instructions,
    workflowStage: input.workflowStage ?? 'creation',
  };
}

export function subjectFromRow(skill: SkillRow): SkillCapabilitySubject {
  return {
    audience: audienceOf(skill.audience),
    brandId: skill.brandId,
    hasPublishedVersion: Boolean(skill.publishedVersionId),
    isQuarantined: skill.isQuarantined,
    organizationId: skill.organizationId,
    ownerKind: ownerOf(skill.ownerKind),
    ownerUserId: skill.ownerUserId,
  };
}

export function subjectFromDocument(
  document: SkillDocument,
): SkillCapabilitySubject {
  const record = document as SkillDocument & {
    audience?: string;
    brandId?: string | null;
    currentVersionId?: string | null;
    isQuarantined?: boolean;
    organizationId?: string | null;
    ownerKind?: string | null;
    ownerUserId?: string | null;
    publishedVersionId?: string | null;
  };
  return {
    audience: audienceOf(record.audience),
    brandId: record.brandId ?? null,
    hasPublishedVersion: Boolean(record.publishedVersionId),
    isQuarantined: record.isQuarantined === true,
    organizationId:
      typeof record.organizationId === 'string' ? record.organizationId : null,
    ownerKind: ownerOf(record.ownerKind),
    ownerUserId: record.ownerUserId ?? null,
  };
}

export function withCapabilities(
  document: SkillDocument,
  decision: ReturnType<typeof resolveSkillCapabilities>,
  canRead: boolean,
): SkillDocument {
  const config = { ...(document.config as Record<string, unknown>) };
  if (!canRead) {
    delete config.defaultInstructions;
    delete config.systemPromptTemplate;
  }
  return {
    ...document,
    ...decision,
    config,
    defaultInstructions: canRead ? document.defaultInstructions : undefined,
    systemPromptTemplate: canRead ? document.systemPromptTemplate : undefined,
  } as SkillDocument;
}

export function toDocument(skill: SkillRow): SkillDocument {
  const config = readConfig(skill);
  return {
    ...config,
    config,
    id: skill.id,
    audience: skill.audience,
    currentVersionId: skill.currentVersionId,
    isQuarantined: skill.isQuarantined,
    label: skill.label,
    organizationId: skill.organizationId,
    ownerKind: skill.ownerKind,
    ownerUserId: skill.ownerUserId,
    publishedVersionId: skill.publishedVersionId,
    sharedVersionId: skill.sharedVersionId,
    revision: skill.revision,
  } as unknown as SkillDocument;
}

export function readConfig(
  skill: { config: Prisma.JsonValue } | SkillRow,
): Record<string, unknown> {
  return skill.config &&
    typeof skill.config === 'object' &&
    !Array.isArray(skill.config)
    ? (skill.config as Record<string, unknown>)
    : {};
}

export function instructionOf(
  skill: SkillRow,
  config: Record<string, unknown>,
): string {
  const system = config.systemPromptTemplate;
  const fallback = config.defaultInstructions;
  if (typeof system === 'string' && system.length > 0) return system;
  if (typeof fallback === 'string') return fallback;
  return skill.label ?? '';
}

export function audienceOf(value: string | null | undefined): SkillAudience {
  if (value === 'public' || value === 'organization' || value === 'private')
    return value;
  return 'private';
}

export function ownerOf(
  value: string | null | undefined,
): SkillOwnerKind | null {
  if (
    value === 'system' ||
    value === 'user' ||
    value === 'organization' ||
    value === 'brand'
  ) {
    return value;
  }
  return null;
}
