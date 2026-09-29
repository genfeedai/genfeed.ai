import type { ModelsService } from '@api/collections/models/services/models.service';
import type { UpdateOrganizationSettingDto } from '@api/collections/organization-settings/dto/update-organization-setting.dto';
import type { OrganizationSettingDocument } from '@api/collections/organization-settings/schemas/organization-setting.schema';
import { testId } from '@helpers/testing/test-id.helper';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentPolicyOverridesService } from './agent-policy-overrides.service';

describe('AgentPolicyOverridesService', () => {
  let modelsService: { findAvailableModels: ReturnType<typeof vi.fn> };
  let service: AgentPolicyOverridesService;

  beforeEach(() => {
    modelsService = { findAvailableModels: vi.fn().mockResolvedValue([]) };
    service = new AgentPolicyOverridesService(
      modelsService as unknown as ModelsService,
    );
  });

  describe('normalizeOverrides', () => {
    it('returns the DTO unchanged when there is no agentPolicy', () => {
      const settingsDto = {
        isWhitelabelEnabled: true,
      } as UpdateOrganizationSettingDto;

      expect(service.normalizeOverrides(settingsDto)).toBe(settingsDto);
    });

    it('clears an override that trims to empty instead of keeping whitespace', () => {
      const settingsDto = {
        agentPolicy: { thinkingModelOverride: '   ' },
      } as UpdateOrganizationSettingDto;

      expect(service.normalizeOverrides(settingsDto)).toEqual({
        agentPolicy: { thinkingModelOverride: null },
      });
    });
  });

  describe('validateOverrides', () => {
    const organizationId = testId('org');
    const textModelId = testId('text-model');
    const imageModelId = testId('image-model');

    const settingsWithAllowlist = {
      agentPolicy: { thinkingModelOverride: null },
      enabledModelIds: [textModelId, imageModelId],
      organizationId,
    } as unknown as OrganizationSettingDocument;

    it('rejects an override key that is not an enabled model for its category', async () => {
      modelsService.findAvailableModels.mockResolvedValue([
        { category: 'text', id: textModelId, key: 'provider/text-model' },
      ]);

      await expect(
        service.validateOverrides(settingsWithAllowlist, {
          agentPolicy: { thinkingModelOverride: 'unknown/not-enabled' },
        } as UpdateOrganizationSettingDto),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('rejects a key that is only enabled for a different override category', async () => {
      modelsService.findAvailableModels.mockResolvedValue([
        { category: 'image', id: imageModelId, key: 'provider/image-model' },
      ]);

      await expect(
        service.validateOverrides(settingsWithAllowlist, {
          // A real, enabled model — but IMAGE, not TEXT — must not satisfy
          // the thinking override's category filter.
          agentPolicy: { thinkingModelOverride: 'provider/image-model' },
        } as UpdateOrganizationSettingDto),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('accepts an override key matched by id instead of key', async () => {
      modelsService.findAvailableModels.mockResolvedValue([
        { category: 'text', id: textModelId, key: 'provider/text-model' },
      ]);

      await expect(
        service.validateOverrides(settingsWithAllowlist, {
          agentPolicy: { thinkingModelOverride: textModelId },
        } as UpdateOrganizationSettingDto),
      ).resolves.toBeUndefined();
    });

    it('does not validate when agentPolicy is not part of the patch', async () => {
      await expect(
        service.validateOverrides(settingsWithAllowlist, {
          isWhitelabelEnabled: true,
        } as UpdateOrganizationSettingDto),
      ).resolves.toBeUndefined();
      expect(modelsService.findAvailableModels).not.toHaveBeenCalled();
    });

    it('validates against the enabledModelIds being saved in the same request, not the stored allowlist', async () => {
      modelsService.findAvailableModels.mockResolvedValue([
        { category: 'text', id: textModelId, key: 'provider/text-model' },
      ]);

      await expect(
        service.validateOverrides(settingsWithAllowlist, {
          // The new allowlist no longer includes the text model.
          agentPolicy: { thinkingModelOverride: 'provider/text-model' },
          enabledModelIds: [imageModelId],
        } as UpdateOrganizationSettingDto),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('preserves a stored override that only differs in surrounding whitespace once normalized', async () => {
      const settingsWithWhitespaceStored = {
        ...settingsWithAllowlist,
        agentPolicy: { thinkingModelOverride: '  provider/text-model  ' },
      } as unknown as OrganizationSettingDocument;

      const normalized = service.normalizeOverrides({
        agentPolicy: { thinkingModelOverride: 'provider/text-model' },
      } as UpdateOrganizationSettingDto);

      await expect(
        service.validateOverrides(settingsWithWhitespaceStored, normalized),
      ).resolves.toBeUndefined();
      expect(modelsService.findAvailableModels).not.toHaveBeenCalled();
    });
  });
});
