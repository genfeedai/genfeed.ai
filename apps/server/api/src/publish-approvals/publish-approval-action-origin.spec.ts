import { runWithActionOrigin } from '@api/action-origin/action-origin.context';
import { ActionOrigin } from '@genfeedai/contracts';
import { buildApprovalProvenance } from './publish-approval-action-origin';

describe('publish approval action origin', () => {
  describe('buildApprovalProvenance', () => {
    it('falls back to the acting user when the context has no actor', () => {
      const provenance = runWithActionOrigin({ origin: ActionOrigin.UI }, () =>
        buildApprovalProvenance(undefined, 'user-2'),
      );

      expect(provenance).toEqual({
        actorUserId: 'user-2',
        contractVersion: 1,
        origin: ActionOrigin.UI,
        source: 'typed-publish-approval',
      });
    });
  });
});
