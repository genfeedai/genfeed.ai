import { AgentStudioHandoffIdentityService } from '@api/services/agent-orchestrator/agent-studio-handoff-identity.service';
import type { AgentStudioHandoffPayload } from '@genfeedai/contracts/interfaces';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const BRAND_ID = '123e4567-e89b-12d3-a456-426614174000';
const SCOPE = { organizationId: 'org-1', userId: 'user-1' };

function payload(
  overrides: Partial<AgentStudioHandoffPayload> = {},
): AgentStudioHandoffPayload {
  return {
    brandId: BRAND_ID,
    modelKey: 'provider/model-x',
    prompt: 'Speak this as the brand identity',
    type: 'video',
    ...overrides,
  };
}

describe('AgentStudioHandoffIdentityService', () => {
  let brandsService: { findOne: ReturnType<typeof vi.fn> };
  let ingredientsService: { findAvatarImageById: ReturnType<typeof vi.fn> };
  let organizationSettingsService: { findOne: ReturnType<typeof vi.fn> };
  let voicesService: { findOne: ReturnType<typeof vi.fn> };
  let service: AgentStudioHandoffIdentityService;

  beforeEach(() => {
    brandsService = { findOne: vi.fn() };
    ingredientsService = { findAvatarImageById: vi.fn() };
    organizationSettingsService = { findOne: vi.fn() };
    voicesService = { findOne: vi.fn() };
    service = new AgentStudioHandoffIdentityService(
      brandsService as never,
      ingredientsService as never,
      organizationSettingsService as never,
      voicesService as never,
    );
  });

  it('strips client-supplied identity from an ordinary image handoff', async () => {
    const result = await service.attachIdentity(
      SCOPE,
      payload({
        avatarPhotoUrl: 'https://cdn.test/sneaked.png',
        type: 'image',
        voiceId: 'sneaked-voice',
      }),
    );

    expect(result).toEqual({
      brandId: BRAND_ID,
      modelKey: 'provider/model-x',
      prompt: 'Speak this as the brand identity',
      type: 'image',
    });
    expect(brandsService.findOne).not.toHaveBeenCalled();
  });

  it('snapshots the brand identity when the generation used it', async () => {
    brandsService.findOne.mockResolvedValue({
      agentConfig: {
        defaultAvatarPhotoUrl: 'https://cdn.test/brand-portrait.png',
        defaultVoiceRef: {
          externalVoiceId: 'brand-voice-1',
          source: 'catalog',
        },
      },
      id: BRAND_ID,
    });
    organizationSettingsService.findOne.mockResolvedValue({
      defaultAvatarPhotoUrl: 'https://cdn.test/org-portrait.png',
      defaultVoiceRef: { externalVoiceId: 'org-voice-1', source: 'catalog' },
    });

    const result = await service.attachIdentity(
      SCOPE,
      payload({
        avatarPhotoUrl: 'https://cdn.test/client.png',
        type: 'video',
        useIdentity: true,
        voiceId: 'client-voice',
      }),
    );

    expect(brandsService.findOne).toHaveBeenCalledWith(
      {
        id: BRAND_ID,
        isDeleted: false,
        organizationId: 'org-1',
      },
      'none',
    );
    expect(result).toEqual({
      avatarPhotoUrl: 'https://cdn.test/brand-portrait.png',
      brandId: BRAND_ID,
      modelKey: 'provider/model-x',
      prompt: 'Speak this as the brand identity',
      type: 'avatar',
      useIdentity: true,
      voiceId: 'brand-voice-1',
    });
  });

  it('resolves a portrait ingredient and voice row when the brand stores ids', async () => {
    brandsService.findOne.mockResolvedValue({
      agentConfig: {
        defaultAvatarIngredientId: 'avatar-ingredient-1',
        defaultVoiceId: 'voice-row-1',
      },
      id: BRAND_ID,
    });
    organizationSettingsService.findOne.mockResolvedValue(null);
    ingredientsService.findAvatarImageById.mockResolvedValue({
      brandId: BRAND_ID,
      cdnUrl: 'https://cdn.test/ingredient-portrait.png',
      id: 'avatar-ingredient-1',
    });
    voicesService.findOne.mockResolvedValue({
      brandId: BRAND_ID,
      externalVoiceId: 'eleven-rachel',
      id: 'voice-row-1',
    });

    const result = await service.attachIdentity(
      SCOPE,
      payload({ type: 'avatar' }),
    );

    expect(ingredientsService.findAvatarImageById).toHaveBeenCalledWith(
      'avatar-ingredient-1',
      'org-1',
    );
    expect(voicesService.findOne).toHaveBeenCalledWith({
      id: 'voice-row-1',
      isDeleted: false,
      organizationId: 'org-1',
    });
    expect(result.avatarPhotoUrl).toBe(
      'https://cdn.test/ingredient-portrait.png',
    );
    expect(result.voiceId).toBe('eleven-rachel');
    expect(result.useIdentity).toBe(true);
  });

  it('omits identity when the brand is not in this organization', async () => {
    brandsService.findOne.mockResolvedValue(null);
    organizationSettingsService.findOne.mockResolvedValue({
      defaultAvatarPhotoUrl: 'https://cdn.test/org-portrait.png',
      defaultVoiceRef: { externalVoiceId: 'org-voice-1', source: 'catalog' },
    });

    const result = await service.attachIdentity(
      SCOPE,
      payload({ type: 'video', useIdentity: true }),
    );

    expect(result).toEqual({
      brandId: BRAND_ID,
      modelKey: 'provider/model-x',
      prompt: 'Speak this as the brand identity',
      type: 'avatar',
      useIdentity: true,
    });
    expect(ingredientsService.findAvatarImageById).not.toHaveBeenCalled();
  });

  it('never applies an avatar or voice that belongs to another brand', async () => {
    brandsService.findOne.mockResolvedValue({
      agentConfig: {
        defaultAvatarIngredientId: 'avatar-ingredient-other',
        defaultVoiceId: 'voice-row-other',
      },
      id: BRAND_ID,
    });
    organizationSettingsService.findOne.mockResolvedValue(null);
    ingredientsService.findAvatarImageById.mockResolvedValue({
      brandId: 'brand-other',
      cdnUrl: 'https://cdn.test/other-portrait.png',
      id: 'avatar-ingredient-other',
    });
    voicesService.findOne.mockResolvedValue({
      brandId: 'brand-other',
      externalVoiceId: 'other-voice',
      id: 'voice-row-other',
    });

    const result = await service.attachIdentity(
      SCOPE,
      payload({ type: 'avatar' }),
    );

    expect(result.avatarPhotoUrl).toBeUndefined();
    expect(result.voiceId).toBeUndefined();
    expect(result.useIdentity).toBe(true);
    expect(result.type).toBe('avatar');
  });
});
