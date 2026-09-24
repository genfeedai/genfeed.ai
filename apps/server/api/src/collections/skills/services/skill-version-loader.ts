import { chooseAuthorizedVersionId } from '@api/collections/skills/policy/skill-authorized-version';
import type { SkillDocument } from '@api/collections/skills/schemas/skill.schema';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { Prisma } from '@genfeedai/prisma';

export interface LoadedSkillVersion {
  contentHash: string;
  id: string;
  instructionText: string;
}

export interface SkillVersionPin {
  contentHash: string;
  skillId: string;
  skillVersionId: string;
}

interface VersionActor {
  brandId?: string | null;
  organizationId: string;
  userId: string;
}

interface VersionedSkill {
  audience?: string | null;
  currentVersionId?: string | null;
  id?: string;
  ownerKind?: string | null;
  ownerUserId?: string | null;
  publishedVersionId?: string | null;
  sharedVersionId?: string | null;
}

const TARGET_RANK: Record<string, number> = {
  brand: 1,
  organization: 2,
  user: 0,
};

function rankTarget(kind: string | null | undefined): number {
  return TARGET_RANK[kind ?? ''] ?? 9;
}

function instructionConfig(
  config: Prisma.JsonValue,
  instructionText: string,
): Prisma.JsonObject {
  const next: Prisma.JsonObject = {};
  if (config && typeof config === 'object' && !Array.isArray(config)) {
    for (const [key, value] of Object.entries(config)) {
      if (value !== undefined) next[key] = value;
    }
  }
  next.defaultInstructions = instructionText;
  next.systemPromptTemplate = instructionText;
  return next;
}

export function applyAuthorizedVersionBody(
  document: SkillDocument,
  version: LoadedSkillVersion,
): SkillDocument {
  return {
    ...document,
    config: instructionConfig(document.config, version.instructionText),
    contentHash: version.contentHash,
    defaultInstructions: version.instructionText,
    skillVersionId: version.id,
    systemPromptTemplate: version.instructionText,
  };
}

export async function loadAuthorizedSkillVersions(
  prisma: PrismaService,
  actor: VersionActor,
  documents: VersionedSkill[],
  editableIds: ReadonlySet<string>,
  pins: readonly SkillVersionPin[] = [],
): Promise<Map<string, LoadedSkillVersion>> {
  const ids = documents.map((document) => String(document.id)).filter(Boolean);
  if (ids.length === 0) return new Map();
  const pinBySkill = new Map(pins.map((pin) => [pin.skillId, pin]));
  const [grants, assignments] = await Promise.all([
    prisma.skillGrant.findMany({
      where: {
        OR: [
          { recipientUserId: actor.userId },
          { recipientOrganizationId: actor.organizationId },
          ...(actor.brandId
            ? [
                {
                  recipientBrandId: actor.brandId,
                  recipientOrganizationId: actor.organizationId,
                },
              ]
            : []),
        ],
        revokedAt: null,
        skillId: { in: ids },
      },
    }),
    prisma.skillAssignment.findMany({
      where: {
        OR: [
          { targetKind: 'organization' },
          { targetKind: 'user', userId: actor.userId },
          ...(actor.brandId
            ? [{ brandId: actor.brandId, targetKind: 'brand' }]
            : []),
        ],
        isDeleted: false,
        isEnabled: true,
        organizationId: actor.organizationId,
        skillId: { in: ids },
      },
    }),
  ]);
  const grantVersion = new Map<string, string>();
  const rankedGrants = [...grants].sort(
    (left, right) =>
      rankTarget(left.recipientKind) - rankTarget(right.recipientKind),
  );
  for (const grant of rankedGrants) {
    if (grant.revokedAt != null) continue;
    if (!grantVersion.has(grant.skillId)) {
      grantVersion.set(grant.skillId, grant.skillVersionId);
    }
  }
  const ranked = [...assignments].sort(
    (left, right) => rankTarget(left.targetKind) - rankTarget(right.targetKind),
  );
  const assignmentVersion = new Map<string, string>();
  for (const assignment of ranked) {
    if (!assignmentVersion.has(assignment.skillId)) {
      assignmentVersion.set(assignment.skillId, assignment.skillVersionId);
    }
  }
  const chosen = new Map<string, string>();
  for (const skill of documents) {
    const skillId = String(skill.id);
    const versionId = chooseAuthorizedVersionId({
      assignmentVersionId: assignmentVersion.get(skillId),
      canEdit:
        editableIds.has(skillId) ||
        (skill.ownerKind === 'user' && skill.ownerUserId === actor.userId),
      grantVersionId: grantVersion.get(skillId),
      pinnedVersionId: pinBySkill.get(skillId)?.skillVersionId,
      pointer: {
        audience: skill.audience ?? null,
        currentVersionId: skill.currentVersionId ?? null,
        ownerKind: skill.ownerKind ?? null,
        publishedVersionId: skill.publishedVersionId ?? null,
        sharedVersionId: skill.sharedVersionId ?? null,
      },
    });
    if (versionId) chosen.set(skillId, versionId);
  }
  const rows =
    chosen.size === 0
      ? []
      : await prisma.skillVersion.findMany({
          where: { id: { in: [...chosen.values()] } },
        });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const loaded = new Map<string, LoadedSkillVersion>();
  for (const [skillId, versionId] of chosen) {
    const row = byId.get(versionId);
    if (!row || row.skillId !== skillId) continue;
    loaded.set(skillId, {
      contentHash: row.contentHash,
      id: row.id,
      instructionText: row.instructionText,
    });
  }
  return loaded;
}
