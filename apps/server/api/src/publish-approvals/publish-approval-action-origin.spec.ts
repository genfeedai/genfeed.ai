import { runWithActionOrigin } from '@api/action-origin/action-origin.context';
import { ActionOrigin } from '@genfeedai/contracts';
import {
  buildApprovalProvenance,
  readApprovalOrigin,
  restoreApprovalProvenance,
} from './publish-approval-action-origin';

describe('publish approval action origin', () => {
  describe('buildApprovalProvenance', () => {
    it('stamps the typed contract with the fallback actor outside any origin context', () => {
      expect(buildApprovalProvenance(undefined, 'user-1')).toEqual({
        actorUserId: 'user-1',
        contractVersion: 1,
        origin: ActionOrigin.UNKNOWN,
        source: 'typed-publish-approval',
      });
    });

    it('prefers the proven context actor and origin over caller-supplied values', () => {
      const provenance = runWithActionOrigin(
        {
          actorUserId: 'context-user',
          apiKeyId: 'api-key-1',
          origin: ActionOrigin.MCP,
        },
        () =>
          buildApprovalProvenance(
            { actorUserId: 'spoofed-user', note: 'keep-me' },
            'fallback-user',
          ),
      );

      expect(provenance).toEqual({
        actorUserId: 'context-user',
        apiKeyId: 'api-key-1',
        contractVersion: 1,
        note: 'keep-me',
        origin: ActionOrigin.MCP,
        source: 'typed-publish-approval',
      });
    });

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

  describe('readApprovalOrigin', () => {
    it('reads the ambient origin inside a context', () => {
      expect(
        runWithActionOrigin({ origin: ActionOrigin.AGENT }, () =>
          readApprovalOrigin(),
        ),
      ).toBe(ActionOrigin.AGENT);
    });

    it('reads unknown outside any context', () => {
      expect(readApprovalOrigin()).toBe(ActionOrigin.UNKNOWN);
    });
  });

  describe('restoreApprovalProvenance', () => {
    it('restores persisted actor, api key, and origin verbatim', () => {
      expect(
        restoreApprovalProvenance(
          {
            actorUserId: 'stored-user',
            apiKeyId: 'stored-key',
            origin: ActionOrigin.CLI,
            source: 'typed-publish-approval',
          },
          'fallback-user',
        ),
      ).toEqual({
        actorUserId: 'stored-user',
        apiKeyId: 'stored-key',
        origin: ActionOrigin.CLI,
        source: 'typed-publish-approval',
      });
    });

    it('normalizes missing fields to the fallback actor and unknown origin', () => {
      expect(
        restoreApprovalProvenance(
          {
            actorUserId: 42,
            apiKeyId: 7,
            origin: 'not-a-real-origin',
            source: 'typed-publish-approval',
          },
          'fallback-user',
        ),
      ).toEqual({
        actorUserId: 'fallback-user',
        origin: ActionOrigin.UNKNOWN,
        source: 'typed-publish-approval',
      });
    });
  });
});
