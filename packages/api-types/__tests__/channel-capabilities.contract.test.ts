import {
  getChannelCapability,
  listChannelCapabilities,
  PRODUCTIZED_SCHEDULER_PLATFORMS,
  validateChannelTargetSettings,
} from '@api-types/contracts/channel-capabilities.contract';
import { CredentialPlatform, TargetValidationState } from '@genfeedai/enums';
import { describe, expect, test } from 'vitest';

describe('channel capability catalog', () => {
  test('reconciles the productized scheduler channels', () => {
    expect(PRODUCTIZED_SCHEDULER_PLATFORMS).toEqual([
      CredentialPlatform.YOUTUBE,
      CredentialPlatform.TIKTOK,
      CredentialPlatform.INSTAGRAM,
      CredentialPlatform.TWITTER,
      CredentialPlatform.LINKEDIN,
    ]);

    expect(
      listChannelCapabilities().map((capability) => capability.platform),
    ).toEqual([
      CredentialPlatform.YOUTUBE,
      CredentialPlatform.TIKTOK,
      CredentialPlatform.INSTAGRAM,
      CredentialPlatform.TWITTER,
      CredentialPlatform.LINKEDIN,
    ]);
  });

  test('keeps backend integration stubs hidden unless explicitly requested', () => {
    expect(
      listChannelCapabilities().some(
        (capability) => capability.platform === CredentialPlatform.REDDIT,
      ),
    ).toBe(false);

    expect(
      listChannelCapabilities({ includeHidden: true }).map(
        (capability) => capability.platform,
      ),
    ).toContain(CredentialPlatform.REDDIT);

    expect(
      listChannelCapabilities({ includePlanned: true }).map(
        (capability) => capability.platform,
      ),
    ).toContain(CredentialPlatform.THREADS);
  });

  test('exposes helper lookup contracts for supported and stubbed platforms', () => {
    expect(getChannelCapability(CredentialPlatform.YOUTUBE)?.helpers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'youtube.channels',
          lookupPath: '/integrations/youtube/channels',
        }),
      ]),
    );

    expect(getChannelCapability(CredentialPlatform.TIKTOK)?.helpers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'tiktok.audio_styles' }),
      ]),
    );

    expect(getChannelCapability(CredentialPlatform.PINTEREST)?.helpers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'pinterest.boards' }),
      ]),
    );
  });
});

describe('validateChannelTargetSettings', () => {
  test('accepts a valid YouTube target', () => {
    const result = validateChannelTargetSettings({
      caption: 'Launch video',
      media: [{ id: 'asset_1', kind: 'video' }],
      platform: CredentialPlatform.YOUTUBE,
      publishMode: 'scheduled',
      settings: {
        privacyStatus: 'unlisted',
      },
    });

    expect(result.valid).toBe(true);
    expect(result.validationState).toBe(TargetValidationState.VALID);
    expect(result.errors).toEqual([]);
  });

  test('returns the same required-setting failure shape for YouTube privacy', () => {
    const result = validateChannelTargetSettings({
      caption: 'Launch video',
      media: [{ id: 'asset_1', kind: 'video' }],
      platform: CredentialPlatform.YOUTUBE,
      publishMode: 'scheduled',
      settings: {},
    });

    expect(result.valid).toBe(false);
    expect(result.validationState).toBe(TargetValidationState.INVALID);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'channel_target.required_setting',
          field: 'settings.privacyStatus',
        }),
      ]),
    );
  });

  test('rejects invalid TikTok privacy values', () => {
    const result = validateChannelTargetSettings({
      caption: 'Short video',
      media: [{ id: 'asset_2', kind: 'short_video' }],
      platform: CredentialPlatform.TIKTOK,
      settings: {
        privacyLevel: 'organization',
      },
    });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'channel_target.invalid_setting_option',
          field: 'settings.privacyLevel',
        }),
      ]),
    );
  });

  test('enforces text limits and media compatibility', () => {
    const result = validateChannelTargetSettings({
      caption: 'x'.repeat(281),
      media: [
        { id: 'asset_1', kind: 'image' },
        { id: 'asset_2', kind: 'image' },
        { id: 'asset_3', kind: 'image' },
        { id: 'asset_4', kind: 'image' },
        { id: 'asset_5', kind: 'image' },
      ],
      platform: CredentialPlatform.TWITTER,
      publishMode: 'publish_now',
    });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'channel_target.caption_too_long' }),
        expect.objectContaining({
          code: 'channel_target.too_many_media_items',
        }),
      ]),
    );
  });

  test('marks hidden and planned channel stubs invalid for publishing', () => {
    expect(
      validateChannelTargetSettings({
        platform: CredentialPlatform.REDDIT,
      }).errors,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'channel_target.hidden_channel' }),
      ]),
    );

    expect(
      validateChannelTargetSettings({
        caption: 'Thread draft',
        platform: CredentialPlatform.THREADS,
      }).errors,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'channel_target.planned_channel' }),
      ]),
    );
  });
});
