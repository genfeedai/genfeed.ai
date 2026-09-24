import { withSkillWriteSession } from '@api/collections/skills/services/skill-write-session';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { Prisma } from '@genfeedai/prisma';

export async function grantedSkillIds(
  prisma: PrismaService,
  organizationId: string,
  userId?: string,
): Promise<string[]> {
  if (!userId) return [];
  const grants = await prisma.skillGrant.findMany({
    select: { skillId: true },
    where: {
      OR: [
        { recipientUserId: userId },
        { recipientOrganizationId: organizationId },
      ],
      revokedAt: null,
    },
  });
  return grants.map((grant) => grant.skillId);
}

export async function updateOwnedPersonalSkill(
  prisma: PrismaService,
  skillId: string,
  userId: string,
  config: Record<string, unknown>,
  label: string | undefined,
) {
  return withSkillWriteSession(
    prisma,
    { actorUserId: userId, origin: 'authoring' },
    (tx) =>
      // tenant-scope-ignore: the owner is editing one personal skill, which has no organization id
      tx.skill.update({
        data: { config: config as Prisma.InputJsonValue, label },
        where: { id: skillId },
      }),
  );
}

export function callerCanSeeSkill(
  row: {
    id: string;
    isDeleted: boolean;
    organizationId: string | null;
    ownerKind: string | null;
    ownerUserId: string | null;
  },
  organizationId: string,
  userId: string | undefined,
  grantedIds: ReadonlySet<string>,
  isTrustedBuiltIn: boolean,
): boolean {
  if (row.isDeleted) return false;
  if (row.organizationId === organizationId || isTrustedBuiltIn) return true;
  if (
    userId !== undefined &&
    row.ownerKind === 'user' &&
    row.ownerUserId === userId
  ) {
    return true;
  }
  return grantedIds.has(row.id);
}
