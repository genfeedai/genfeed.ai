import type { ModelRegistrationService } from '@api/collections/models/services/model-registration.service';
import { AvatarVideoModelService } from '@api/collections/videos/services/avatar-video-model.service';
import type { RouterService } from '@api/services/router/router.service';
import { ModelCategory, RouterPriority } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { HeyGenAvatarRef } from '@genfeedai/contracts/interfaces';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';

function look(
  avatarType: string,
  supportedEngines: string[] = ['avatar_iv', 'avatar_v'],
): HeyGenAvatarRef {
  return {
    avatarType,
    connection: { kind: 'platform', organizationId: 'org', provider: 'heygen' },
    groupId: null,
    label: 'Look',
    lookId: 'look',
    ownership: 'public',
    preview: null,
    provider: 'heygen',
    readiness: {
      consentStatus: null,
      groupStatus: null,
      lookStatus: 'completed',
      reason: null,
      usable: true,
    },
    source: 'heygen-look',
    supportedEngines,
    version: 1,
  };
}

type RouteRequest = { eligibleModelKeys: string[] } & Record<string, unknown>;

describe('AvatarVideoModelService', () => {
  let routed: RouteRequest[];
  let validated: [string, string][];
  let disabledModels: Set<string>;
  // The router picks the newest eligible engine; the allowlist rejects
  // whatever the workspace switched off.
  const router = {
    selectModel: async (request: RouteRequest) => {
      routed.push(request);
      return { selectedModel: request.eligibleModelKeys.at(-1) };
    },
  };
  const registration = {
    validateModelForOrg: async (key: string, organizationId: string) => {
      validated.push([key, organizationId]);
      if (disabledModels.has(key))
        throw new ForbiddenException('Model not enabled for this organization');
      return { key };
    },
  };
  const service = new AvatarVideoModelService(
    router as unknown as RouterService,
    registration as unknown as ModelRegistrationService,
  );

  beforeEach(() => {
    routed = [];
    validated = [];
    disabledModels = new Set();
  });

  it('routes Auto among the engines the look supports', async () => {
    await expect(
      service.resolve(
        { prioritize: RouterPriority.QUALITY, text: 'Hello there' },
        look('digital_twin'),
        'org',
      ),
    ).resolves.toEqual({
      avatarType: 'digital_twin',
      engine: 'avatar_v',
      modelKey: MODEL_KEYS.HEYGEN_AVATAR_V,
    });
    expect(routed).toEqual([
      {
        category: ModelCategory.AVATAR,
        eligibleModelKeys: [
          MODEL_KEYS.HEYGEN_AVATAR_IV,
          MODEL_KEYS.HEYGEN_AVATAR_V,
        ],
        organizationId: 'org',
        prioritize: 'quality',
        prompt: 'Hello there',
      },
    ]);
  });

  it('passes a photo avatar only Avatar IV as eligible', async () => {
    await expect(
      service.resolve({ text: 'Hi' }, look('photo_avatar'), 'org'),
    ).resolves.toMatchObject({
      engine: 'avatar_iv',
      modelKey: MODEL_KEYS.HEYGEN_AVATAR_IV,
    });

    expect(routed).toEqual([
      expect.objectContaining({
        eligibleModelKeys: [MODEL_KEYS.HEYGEN_AVATAR_IV],
        prioritize: 'balanced',
      }),
    ]);
  });

  it('accepts an explicit engine the look supports after the org allowlist check', async () => {
    await expect(
      service.resolve(
        { model: MODEL_KEYS.HEYGEN_AVATAR_IV, text: 'Hi' },
        look('digital_twin'),
        'org',
      ),
    ).resolves.toMatchObject({
      engine: 'avatar_iv',
      modelKey: MODEL_KEYS.HEYGEN_AVATAR_IV,
    });
    expect(validated).toEqual([[MODEL_KEYS.HEYGEN_AVATAR_IV, 'org']]);
    expect(routed).toEqual([]);
  });

  it.each([
    ['a photo avatar', look('photo_avatar')],
    ['a twin without avatar_v', look('digital_twin', ['avatar_iv'])],
  ])('refuses an explicit Avatar V for %s', async (_name, avatarRef) => {
    await expect(
      service.resolve(
        { model: MODEL_KEYS.HEYGEN_AVATAR_V, text: 'Hi' },
        avatarRef,
        'org',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(validated).toEqual([]);
  });

  it('surfaces an engine the workspace has switched off', async () => {
    disabledModels.add(MODEL_KEYS.HEYGEN_AVATAR_V);

    await expect(
      service.resolve(
        { model: MODEL_KEYS.HEYGEN_AVATAR_V, text: 'Hi' },
        look('digital_twin'),
        'org',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each([
    { autoSelectModel: true, model: MODEL_KEYS.HEYGEN_AVATAR_IV },
    { model: '__auto_model__' },
    { model: MODEL_KEYS.HEYGEN_AVATAR },
  ])('treats %o as Auto', async (params) => {
    await expect(
      service.resolve({ ...params, text: 'Hi' }, look('digital_twin'), 'org'),
    ).resolves.toMatchObject({ modelKey: MODEL_KEYS.HEYGEN_AVATAR_V });

    expect(routed).toHaveLength(1);
    expect(validated).toEqual([]);
  });

  it('keeps photo animation on the flat row and refuses Avatar V for it', async () => {
    await expect(
      service.resolve({ text: 'Hi' }, undefined, 'org'),
    ).resolves.toEqual({ modelKey: MODEL_KEYS.HEYGEN_AVATAR });
    await expect(
      service.resolve(
        { model: MODEL_KEYS.HEYGEN_AVATAR_V, text: 'Hi' },
        undefined,
        'org',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(routed).toEqual([]);
  });

  it('refuses a look with no priced engine', async () => {
    await expect(
      service.resolve({ text: 'Hi' }, look('image', ['avatar_iv']), 'org'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(routed).toEqual([]);
  });
});
