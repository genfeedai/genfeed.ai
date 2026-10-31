import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  store: {} as Record<string, unknown>,
}));
vi.mock('~services/workspace.service', () => ({
  assertWorkspace: vi.fn(),
  scopedWorkspaceRequest: mocks.request,
}));

import {
  loadLocalVoice,
  projectVoiceSnapshot,
  refreshLocalVoiceCache,
  VoiceUnavailableError,
} from '~services/brand-voice-snapshot.service';

const workspace = {
  brandId: 'brand-1',
  brands: [],
  isApiKey: false,
  organizationId: 'org-1',
  organizationLabel: 'Org',
  organizations: [],
  revision: 1,
  userId: 'user-1',
};

function identity(overrides: Record<string, unknown> = {}) {
  return {
    approval: 'approved',
    brandId: 'brand-1',
    contentHash: 'sha256:abc',
    generationRules: {
      avoid: [
        { appliesToMediaKinds: ['image'], id: 'a1', text: 'Image only rule' },
        { id: 'a2', text: 'Never promise results' },
      ],
      examples: [{ id: 'e1', polarity: 'positive', text: 'Ship it.' }],
      facts: [
        {
          id: 'f2',
          kind: 'statement',
          predicate: 'is spelled',
          required: false,
          subject: 'Brand',
          value: 'Genfeed',
        },
        {
          id: 'f1',
          kind: 'price',
          predicate: 'costs',
          required: true,
          subject: 'Plan',
          unit: 'USD',
          value: 29,
        },
      ],
      mandatory: [{ id: 'm1', text: 'Mention the studio' }],
    },
    identity: { description: 'Dev tools', name: 'Genfeed' },
    resolvedAt: '2026-10-01T10:00:00.000Z',
    revisionId: 'rev-1',
    schemaVersion: 1,
    voice: {
      audience: ['makers'],
      avoid: ['jargon'],
      messagingPillars: ['speed'],
      tone: 'Warm',
      values: ['craft'],
    },
    ...overrides,
  };
}

function previewResponse(snapshot: unknown, status = 200) {
  return new Response(
    JSON.stringify({
      data: {
        attributes: { snapshot, source: 'current_approved_revision' },
        type: 'brand-identity-preview',
      },
    }),
    { status },
  );
}

describe('projectVoiceSnapshot', () => {
  it('keeps the text-relevant voice and rules of an approved identity', () => {
    const snapshot = projectVoiceSnapshot(identity());

    expect(snapshot).toMatchObject({
      brandId: 'brand-1',
      identity: { name: 'Genfeed' },
      rules: {
        avoid: ['Never promise results'],
        examples: [{ polarity: 'positive', text: 'Ship it.' }],
        facts: ['Plan costs: 29 USD', 'Brand is spelled: Genfeed'],
        mandatory: ['Mention the studio'],
      },
      voice: { audience: ['makers'], avoid: ['jargon'], tone: 'Warm' },
    });
    expect(JSON.stringify(snapshot)).not.toContain('Image only rule');
  });

  it('refuses anything that is not approved or not shaped like an identity', () => {
    expect(
      projectVoiceSnapshot(identity({ approval: 'provisional' })),
    ).toBeNull();
    expect(projectVoiceSnapshot(null)).toBeNull();
    expect(projectVoiceSnapshot(identity({ identity: {} }))).toBeNull();
  });

  it('bounds long and numerous entries instead of failing', () => {
    const snapshot = projectVoiceSnapshot(
      identity({
        voice: {
          audience: Array.from({ length: 40 }, (_, i) => `audience ${i}`),
          guidelines: 'g'.repeat(10_000),
        },
      }),
    );

    expect(snapshot?.voice.audience).toHaveLength(12);
    expect(snapshot?.voice.guidelines).toHaveLength(3_000);
  });
});

describe('loadLocalVoice', () => {
  beforeEach(() => {
    mocks.request.mockReset();
    mocks.store = {};
    vi.mocked(chrome.storage.local.get).mockImplementation((async (
      key: string,
    ) => ({
      [key]: mocks.store[key],
    })) as never);
    vi.mocked(chrome.storage.local.set).mockImplementation((async (
      items: Record<string, unknown>,
    ) => {
      Object.assign(mocks.store, items);
    }) as never);
    vi.mocked(chrome.storage.local.remove).mockImplementation((async (
      key: string,
    ) => {
      delete mocks.store[key];
    }) as never);
  });

  it('reads the approved voice live from the identity preview and keeps a copy', async () => {
    mocks.request.mockResolvedValue(previewResponse(identity()));

    const voice = await loadLocalVoice(workspace);

    expect(voice.source).toBe('live');
    expect(voice.snapshot?.identity.name).toBe('Genfeed');
    expect(mocks.request).toHaveBeenCalledWith(
      '/brands/brand-1/generation-receipts/identity-preview',
      expect.objectContaining({ method: 'GET' }),
      workspace,
    );
    expect(Object.keys(mocks.store)).toEqual([
      'genfeed-voice-snapshot:user-1:org-1:brand-1',
    ]);
  });

  it('runs without voice, and drops the copy, when the brand has no approved voice', async () => {
    mocks.request.mockResolvedValueOnce(previewResponse(identity()));
    await loadLocalVoice(workspace);
    mocks.request.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'brand_identity_unavailable' }), {
        status: 409,
      }),
    );

    const voice = await loadLocalVoice(workspace);

    expect(voice).toEqual({ savedAt: null, snapshot: null, source: 'none' });
    expect(mocks.store).toEqual({});
  });

  it('uses a recent copy when Genfeed cannot be read', async () => {
    mocks.request.mockResolvedValueOnce(previewResponse(identity()));
    await loadLocalVoice(workspace);
    mocks.request.mockResolvedValueOnce(new Response('{}', { status: 503 }));

    const voice = await loadLocalVoice(workspace);

    expect(voice.source).toBe('cached');
    expect(voice.snapshot?.identity.name).toBe('Genfeed');
    expect(voice.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('stops instead of guessing when nothing recent is saved', async () => {
    mocks.request.mockResolvedValue(new Response('{}', { status: 503 }));
    await expect(loadLocalVoice(workspace)).rejects.toBeInstanceOf(
      VoiceUnavailableError,
    );

    mocks.store['genfeed-voice-snapshot:user-1:org-1:brand-1'] = {
      savedAt: Date.now() - 25 * 60 * 60 * 1000,
      snapshot: projectVoiceSnapshot(identity()),
    };
    await expect(loadLocalVoice(workspace)).rejects.toBeInstanceOf(
      VoiceUnavailableError,
    );
  });

  it('never uses a copy that belongs to another brand', async () => {
    mocks.store['genfeed-voice-snapshot:user-1:org-1:brand-1'] = {
      savedAt: Date.now(),
      snapshot: projectVoiceSnapshot(identity({ brandId: 'brand-2' })),
    };
    mocks.request.mockResolvedValue(new Response('{}', { status: 503 }));

    await expect(loadLocalVoice(workspace)).rejects.toBeInstanceOf(
      VoiceUnavailableError,
    );
  });

  it('surfaces an access failure for recovery instead of using a copy', async () => {
    mocks.request.mockResolvedValueOnce(previewResponse(identity()));
    await loadLocalVoice(workspace);
    mocks.request.mockResolvedValueOnce(new Response('{}', { status: 403 }));

    await expect(loadLocalVoice(workspace)).rejects.toMatchObject({
      kind: 'http',
      status: 403,
    });
  });

  it('treats a network failure like an unreadable answer', async () => {
    mocks.request.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(loadLocalVoice(workspace)).rejects.toBeInstanceOf(
      VoiceUnavailableError,
    );
  });
});

describe('refreshLocalVoiceCache', () => {
  it('keeps a copy fresh at most once an hour and never throws', async () => {
    mocks.request.mockReset();
    mocks.store = {};
    vi.mocked(chrome.storage.local.set).mockImplementation((async (
      items: Record<string, unknown>,
    ) => {
      Object.assign(mocks.store, items);
    }) as never);
    mocks.request.mockResolvedValue(previewResponse(identity()));
    const other = { ...workspace, brandId: 'brand-9' };
    mocks.request.mockResolvedValueOnce(
      previewResponse(identity({ brandId: 'brand-9' })),
    );

    await refreshLocalVoiceCache(other);
    await refreshLocalVoiceCache(other);

    expect(mocks.request).toHaveBeenCalledTimes(1);
    mocks.request.mockRejectedValue(new Error('offline'));
    await expect(
      refreshLocalVoiceCache({ ...workspace, brandId: 'brand-8' }),
    ).resolves.toBeUndefined();
  });
});
