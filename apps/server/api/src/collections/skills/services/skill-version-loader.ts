import {
  chooseAuthorizedVersionId,
  chooseReadableVersionId,
} from '@api/collections/skills/policy/skill-authorized-version';
import {
  grantMatchesActor,
  type SkillCapabilityGrant,
  skillGrantRecipientClauses,
} from '@api/collections/skills/policy/skill-capabilities';
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
  allowsCatalogRead?: boolean;
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

interface GrantRow {
  access?: string | null;
  recipientBrandId?: string | null;
  recipientKind?: string | null;
  recipientOrganizationId?: string | null;
  recipientUserId?: string | null;
  revokedAt?: Date | null;
  skillId: string;
  skillVersionId: string;
}

function rankTarget(kind: string | null | undefined): number {
  return TARGET_RANK[kind ?? ''] ?? 9;
}

function asCapabilityGrant(grant: GrantRow): SkillCapabilityGrant {
  const kind = grant.recipientKind;
  return {
    access: grant.access === 'use_and_read' ? 'use_and_read' : 'use',
    isRevoked: grant.revokedAt != null,
    recipientBrandId: grant.recipientBrandId ?? null,
    recipientKind: kind === 'organization' || kind === 'brand' ? kind : 'user',
    recipientOrganizationId: grant.recipientOrganizationId ?? null,
    recipientUserId: grant.recipientUserId ?? null,
  };
}

function grantVersionBySkill(
  grants: readonly GrantRow[],
  actor: VersionActor,
  readableOnly: boolean,
): Map<string, string> {
  const ranked = grants
    .filter((grant) => {
      const capability = asCapabilityGrant(grant);
      return (
        grantMatchesActor(capability, actor) &&
        (!readableOnly || capability.access === 'use_and_read')
      );
    })
    .sort(
      (left, right) =>
        rankTarget(left.recipientKind) - rankTarget(right.recipientKind),
    );
  const chosen = new Map<string, string>();
  for (const grant of ranked) {
    if (!chosen.has(grant.skillId)) {
      chosen.set(grant.skillId, grant.skillVersionId);
    }
  }
  return chosen;
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
  purpose: 'execute' | 'read' = 'execute',
): Promise<Map<string, LoadedSkillVersion>> {
  const ids = documents.map((document) => String(document.id)).filter(Boolean);
  if (ids.length === 0) return new Map();
  const pinBySkill = new Map(pins.map((pin) => [pin.skillId, pin]));
  const [grants, assignments] = await Promise.all([
    prisma.skillGrant.findMany({
      where: {
        OR: skillGrantRecipientClauses(actor),
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
  const grantVersion = grantVersionBySkill(grants, actor, purpose === 'read');
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
    const pointer = {
      audience: skill.audience ?? null,
      currentVersionId: skill.currentVersionId ?? null,
      ownerKind: skill.ownerKind ?? null,
      publishedVersionId: skill.publishedVersionId ?? null,
      sharedVersionId: skill.sharedVersionId ?? null,
    };
    const versionId =
      purpose === 'read'
        ? chooseReadableVersionId({
            allowsCatalogRead: skill.allowsCatalogRead === true,
            pointer,
            readGrantVersionId: grantVersion.get(skillId),
          })
        : chooseAuthorizedVersionId({
            assignmentVersionId: assignmentVersion.get(skillId),
            canEdit:
              editableIds.has(skillId) ||
              (skill.ownerKind === 'user' &&
                skill.ownerUserId === actor.userId),
            grantVersionId: grantVersion.get(skillId),
            pinnedVersionId: pinBySkill.get(skillId)?.skillVersionId,
            pointer,
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
