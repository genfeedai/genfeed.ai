import { ExternalVoiceCatalogService } from '@api/collections/voices/services/external-voice-catalog.service';
import { VoicesService } from '@api/collections/voices/services/voices.service';
import { AgentPrepareToolHandler } from '@api/services/agent-orchestrator/tools/agent-prepare-tool-handler.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { VoiceCloneStatus, VoiceProvider } from '@genfeedai/enums';
import { VoiceProvider as DbVoiceProvider } from '@genfeedai/prisma';
import { describe, expect, it, vi } from 'vitest';

type PrepareHandlerCtor = ConstructorParameters<typeof AgentPrepareToolHandler>;

const ctx = {
  brandId: 'brand-1',
  organizationId: 'org-1',
  userId: 'user-1',
} as ToolExecutionContext;

function createHandler(params: {
  catalogFindAll?: ReturnType<typeof vi.fn>;
  voicesFindAll?: ReturnType<typeof vi.fn>;
}): AgentPrepareToolHandler {
  const brandsService = {
    findOne: vi.fn().mockResolvedValue({ id: 'brand-1' }),
  };
  const voicesService = {
    findAll: params.voicesFindAll ?? vi.fn().mockResolvedValue({ docs: [] }),
  };
  const catalogService = {
    findAll: params.catalogFindAll ?? vi.fn().mockResolvedValue([]),
  };

  return new AgentPrepareToolHandler(
    brandsService as unknown as PrepareHandlerCtor[0],
    {} as PrepareHandlerCtor[1],
    undefined,
    voicesService as unknown as VoicesService,
    catalogService as unknown as ExternalVoiceCatalogService,
  );
}

describe('AgentPrepareToolHandler.prepareVoiceClone', () => {
  it('fills the card from the platform catalog when the org has no voices', async () => {
    const catalogFindAll = vi.fn().mockResolvedValue([
      {
        createdAt: new Date('2026-01-01'),
        externalId: 'eleven-rachel',
        externalProvider: DbVoiceProvider.ELEVENLABS,
        id: 'catalog-1',
        isActive: true,
        isDefaultSelectable: true,
        isFeatured: false,
        language: 'en',
        name: 'Rachel',
        providerData: {},
        sampleAudioUrl: 'https://example.test/rachel.mp3',
        updatedAt: new Date('2026-01-02'),
      },
    ]);
    const handler = createHandler({ catalogFindAll });

    const result = await handler.prepareVoiceClone(ctx);
    const card = result.nextActions?.[0];

    expect(catalogFindAll).toHaveBeenCalledWith({ isActive: true });
    expect(result.success).toBe(true);
    expect(card?.canUseExisting).toBe(true);
    expect(card?.existingVoices).toEqual([
      {
        cloneStatus: VoiceCloneStatus.READY,
        id: 'eleven-rachel',
        label: 'Rachel',
        provider: VoiceProvider.ELEVENLABS,
      },
    ]);
    expect(card?.recommendedVoiceId).toBe('eleven-rachel');
  });

  it('keeps cloned org voices and does not read the catalog', async () => {
    const catalogFindAll = vi.fn();
    const handler = createHandler({
      catalogFindAll,
      voicesFindAll: vi.fn().mockResolvedValue({
        docs: [
          {
            cloneStatus: VoiceCloneStatus.READY,
            id: 'cloned-1',
            label: 'Studio clone',
            provider: VoiceProvider.ELEVENLABS,
          },
        ],
      }),
    });

    const result = await handler.prepareVoiceClone(ctx);

    expect(catalogFindAll).not.toHaveBeenCalled();
    expect(result.nextActions?.[0]?.existingVoices).toEqual([
      {
        cloneStatus: VoiceCloneStatus.READY,
        id: 'cloned-1',
        label: 'Studio clone',
        provider: VoiceProvider.ELEVENLABS,
      },
    ]);
  });

  it('still docks a voice card when the org library and catalog are both empty', async () => {
    const catalogFindAll = vi.fn().mockResolvedValue([]);
    const handler = createHandler({ catalogFindAll });

    const result = await handler.prepareVoiceClone(ctx);
    const card = result.nextActions?.[0];

    expect(catalogFindAll).toHaveBeenCalledWith({ isActive: true });
    expect(result.success).toBe(true);
    expect(result.nextActions).toHaveLength(1);
    expect(card?.type).toBe('voice_clone_card');
    expect(card?.canUseExisting).toBe(false);
    expect(card?.existingVoices).toEqual([]);
    expect(card?.description).toMatch(/catalog is empty/i);
  });

  it('keeps generate_voice text on the catalog-backed card', async () => {
    const catalogFindAll = vi.fn().mockResolvedValue([
      {
        createdAt: new Date('2026-01-01'),
        externalId: 'eleven-rachel',
        externalProvider: DbVoiceProvider.ELEVENLABS,
        id: 'catalog-1',
        isActive: true,
        isDefaultSelectable: true,
        isFeatured: false,
        language: 'en',
        name: 'Rachel',
        providerData: {},
        sampleAudioUrl: 'https://example.test/rachel.mp3',
        updatedAt: new Date('2026-01-02'),
      },
    ]);
    const handler = createHandler({ catalogFindAll });

    const result = await handler.prepareVoiceClone(ctx, {
      text: 'Welcome to FUD News',
    });
    const card = result.nextActions?.[0];

    expect(result.success).toBe(true);
    expect(card?.canUseExisting).toBe(true);
    expect(card?.title).toBe('Generate Voice');
    expect(card?.description).toContain('Welcome to FUD News');
  });
});
