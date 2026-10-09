import { serializeGenerationEntry } from '@serializers/helpers/generation-entry.helper';
import { describe, expect, it } from 'vitest';

describe('generation entry whitelist', () => {
  it('does not expose provider credentials or actor fields', () => {
    expect(
      serializeGenerationEntry({
        providerData: {
          token: 'private',
          generationEntry: {
            channel: 'api',
            attribution: 'server_verified',
            actorUserId: 'private',
            token: 'private',
          },
        },
      }),
    ).toEqual({ channel: 'api', attribution: 'server_verified' });
  });
  it('leaves historical entries absent and rejects unsupported attribution', () => {
    expect(
      serializeGenerationEntry({ providerData: { compiler: 'legacy' } }),
    ).toBeUndefined();
    expect(
      serializeGenerationEntry({
        providerData: {
          generationEntry: {
            channel: 'desktop',
            attribution: 'server_verified',
          },
        },
      }),
    ).toBeUndefined();
  });
});
