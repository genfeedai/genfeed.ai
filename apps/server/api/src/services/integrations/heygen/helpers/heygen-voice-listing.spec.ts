import { describe, expect, it, vi } from 'vitest';

import {
  type HeyGenVoiceListing,
  listPersonalHeyGenVoices,
  listPublicHeyGenVoices,
} from './heygen-voice-listing';

const publicVoice = {
  connection: {
    kind: 'platform' as const,
    organizationId: 'org-1',
    provider: 'heygen' as const,
  },
  gender: 'female' as const,
  index: 0,
  name: 'Stock',
  ownership: 'public' as const,
  preview: '',
  voiceId: 'stock',
};

function listing(
  overrides: Partial<HeyGenVoiceListing> = {},
): HeyGenVoiceListing {
  return {
    constructorName: 'HeyGenService',
    getPlatformApiKey: () => 'platform-key',
    lookupPersonalCredential: vi.fn().mockResolvedValue(undefined),
    platformCredentialVersion: () => 'version-1',
    readVoiceCatalog: vi.fn().mockResolvedValue([publicVoice]),
    warn: vi.fn(),
    ...overrides,
  };
}

describe('listPublicHeyGenVoices', () => {
  it('returns nothing and skips HeyGen when the platform key is missing', async () => {
    const reader = listing({ getPlatformApiKey: () => '' });

    await expect(listPublicHeyGenVoices(reader, 'org-1')).resolves.toEqual([]);
    expect(reader.readVoiceCatalog).not.toHaveBeenCalled();
  });

  it('reads the public partition on the platform key', async () => {
    const reader = listing();

    await expect(listPublicHeyGenVoices(reader, 'org-1')).resolves.toEqual([
      publicVoice,
    ]);
    expect(reader.readVoiceCatalog).toHaveBeenCalledWith(
      {
        apiKey: 'platform-key',
        binding: {
          provider: 'heygen',
          kind: 'platform',
          organizationId: 'org-1',
          credentialVersionId: 'version-1',
        },
      },
      'public',
    );
  });
});

describe('listPersonalHeyGenVoices', () => {
  it('returns nothing without an entitled workspace key', async () => {
    const reader = listing();

    await expect(listPersonalHeyGenVoices(reader, 'org-1')).resolves.toEqual(
      [],
    );
    expect(reader.readVoiceCatalog).not.toHaveBeenCalled();
  });

  it('lets a credential lookup failure surface', async () => {
    const reader = listing({
      lookupPersonalCredential: vi
        .fn()
        .mockRejectedValue(new Error('storage down')),
    });

    await expect(listPersonalHeyGenVoices(reader, 'org-1')).rejects.toThrow(
      'storage down',
    );
    expect(reader.warn).not.toHaveBeenCalled();
  });

  it('reads the private partition with the workspace credential', async () => {
    const reader = listing({
      lookupPersonalCredential: vi.fn().mockResolvedValue({
        apiKey: 'byok-key',
        credentialId: 'cred-1',
      }),
    });

    await expect(listPersonalHeyGenVoices(reader, 'org-1')).resolves.toEqual([
      publicVoice,
    ]);
    expect(reader.readVoiceCatalog).toHaveBeenCalledWith(
      {
        apiKey: 'byok-key',
        binding: {
          provider: 'heygen',
          kind: 'byok',
          organizationId: 'org-1',
          credentialVersionId: 'cred-1',
        },
      },
      'private',
    );
  });

  it('keeps stock voices when the workspace listing fails', async () => {
    const reader = listing({
      lookupPersonalCredential: vi.fn().mockResolvedValue({
        apiKey: 'byok-key',
        credentialId: 'cred-1',
      }),
      readVoiceCatalog: vi.fn().mockRejectedValue(new Error('heygen down')),
    });

    await expect(listPersonalHeyGenVoices(reader, 'org-1')).resolves.toEqual(
      [],
    );
    expect(reader.warn).toHaveBeenCalledWith(
      'HeyGenService personal voices unavailable',
      { error: 'heygen down' },
    );
  });
});
