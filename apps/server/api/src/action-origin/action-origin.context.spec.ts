import { ActionOrigin } from '@genfeedai/enums';
import {
  getActionOriginContext,
  normalizeActionOrigin,
  resolveNestedActionOrigin,
  runWithActionOrigin,
  withActionOriginMetadata,
} from './action-origin.context';

describe('action origin context', () => {
  it('normalizes legacy and unsupported values to unknown', () => {
    expect(normalizeActionOrigin(undefined)).toBe(ActionOrigin.UNKNOWN);
    expect(normalizeActionOrigin('browser')).toBe(ActionOrigin.UNKNOWN);
    expect(normalizeActionOrigin(ActionOrigin.MCP)).toBe(ActionOrigin.MCP);
  });

  it('keeps actor and API-key references without storing credentials', () => {
    runWithActionOrigin(
      {
        actorUserId: 'user-1',
        apiKeyId: 'key-1',
        apiKey: 'raw-key-must-not-cross-the-boundary',
        origin: ActionOrigin.MCP,
      } as never,
      () => {
        expect(
          withActionOriginMetadata({
            actorUserId: 'spoofed-user',
            apiKeyId: 'spoofed-key',
            origin: ActionOrigin.UI,
            source: 'generation',
          }),
        ).toEqual({
          actorUserId: 'user-1',
          apiKeyId: 'key-1',
          origin: ActionOrigin.MCP,
          source: 'generation',
        });
      },
    );
  });

  it('preserves external initiators and classifies trusted nested work', () => {
    runWithActionOrigin({ origin: ActionOrigin.MCP }, () => {
      expect(resolveNestedActionOrigin(ActionOrigin.WORKFLOW).origin).toBe(
        ActionOrigin.MCP,
      );
    });
    runWithActionOrigin({ origin: ActionOrigin.UI }, () => {
      expect(resolveNestedActionOrigin(ActionOrigin.AGENT).origin).toBe(
        ActionOrigin.AGENT,
      );
    });
    expect(getActionOriginContext().origin).toBe(ActionOrigin.UNKNOWN);
  });
});
