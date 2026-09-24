import type { Prisma } from '@genfeedai/prisma';

export type SkillWriteOrigin =
  | 'authoring'
  | 'capture'
  | 'provisioning'
  | 'repair';

interface SkillWriteClient {
  $transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
}

/**
 * Puts attribution on the current transaction for the skill capture trigger.
 * The settings are not authorization; the policy service still checks the actor.
 */
export async function withSkillWriteSession<T>(
  prisma: SkillWriteClient,
  input: {
    actorUserId?: string | null;
    activateVersionId?: string | null;
    origin: SkillWriteOrigin;
  },
  write: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('genfeed.skill_write_origin', ${input.origin}, true)`;
    if (input.actorUserId) {
      await tx.$executeRaw`SELECT set_config('genfeed.skill_actor_id', ${input.actorUserId}, true)`;
    }
    if (input.activateVersionId) {
      await tx.$executeRaw`SELECT set_config('genfeed.skill_activate_version_id', ${input.activateVersionId}, true)`;
    }
    return write(tx);
  });
}
