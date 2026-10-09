import { ActionOrigin } from '@genfeedai/contracts';
import {
  GenerationEntryAttribution,
  GenerationEntryChannel,
} from '@genfeedai/contracts/interfaces/content/generation-entry.interface';
import {
  getActionOriginContext,
  normalizeActionOrigin,
  resolveNestedActionOrigin,
  runWithActionOrigin,
  runWithGenerationEntry,
  withActionOriginMetadata,
} from './action-origin.context';

describe('action origin context', () => {
  it('preserves named entry metadata through durable context serialization and nested work', () => {
    const generationEntry = {
      channel: GenerationEntryChannel.DESKTOP,
      attribution: GenerationEntryAttribution.CLIENT_REPORTED,
    };
    runWithActionOrigin(
      { origin: ActionOrigin.UI, actorUserId: 'actor', generationEntry },
      () => {
        const serialized = JSON.parse(JSON.stringify(getActionOriginContext()));
        runWithActionOrigin(serialized, () => {
          expect(resolveNestedActionOrigin(ActionOrigin.AGENT)).toEqual({
            origin: ActionOrigin.AGENT,
            actorUserId: 'actor',
            generationEntry,
          });
          expect(
            withActionOriginMetadata({ generationEntry: { channel: 'mcp' } }),
          ).toMatchObject({ generationEntry });
        });
      },
    );
    expect(withActionOriginMetadata({ generationEntry })).not.toHaveProperty(
      'generationEntry',
    );
  });

  it('restores a retry entry without borrowing the current entry or changing the proven actor', () => {
    const generationEntry = {
      channel: GenerationEntryChannel.WEB,
      attribution: GenerationEntryAttribution.CLIENT_REPORTED,
    };
    runWithActionOrigin(
      {
        origin: ActionOrigin.MCP,
        actorUserId: 'actor',
        apiKeyId: 'key',
        generationEntry: {
          channel: GenerationEntryChannel.MCP,
          attribution: GenerationEntryAttribution.SERVER_VERIFIED,
        },
      },
      () => {
        runWithGenerationEntry(generationEntry, () =>
          expect(getActionOriginContext()).toEqual({
            origin: ActionOrigin.MCP,
            actorUserId: 'actor',
            apiKeyId: 'key',
            generationEntry,
          }),
        );
        runWithGenerationEntry(undefined, () =>
          expect(getActionOriginContext()).not.toHaveProperty(
            'generationEntry',
          ),
        );
        expect(getActionOriginContext().generationEntry?.channel).toBe(
          GenerationEntryChannel.MCP,
        );
      },
    );
  });

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
