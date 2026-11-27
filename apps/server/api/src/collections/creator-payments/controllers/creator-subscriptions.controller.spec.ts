import { CreatorSubscriptionsController } from '@api/collections/creator-payments/controllers/creator-subscriptions.controller';
import { ROLES_KEY } from '@api/helpers/decorators/roles/roles.decorator';
import { MemberRole } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

const rolesOf = (handler: unknown): unknown =>
  Reflect.getMetadata(ROLES_KEY, handler as object);

describe('creator subscription routes (#9793)', () => {
  it.each([['listOutgoing'], ['setOutgoingCancelAtPeriodEnd']] as const)(
    '%s is limited to workspace owners and admins',
    (route) => {
      expect(rolesOf(CreatorSubscriptionsController.prototype[route])).toEqual([
        MemberRole.OWNER,
        MemberRole.ADMIN,
      ]);
    },
  );

  it('keeps the reader-side cancel open to any signed-in member', () => {
    expect(
      rolesOf(CreatorSubscriptionsController.prototype.setCancelAtPeriodEnd),
    ).toBeUndefined();
  });
});
