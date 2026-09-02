import { describe, expect, test } from 'vitest';
import {
  CredentialPlatform,
  PostVisibility,
  TargetValidationState,
} from '../../src';
import {
  channelTargetValidationResultSchema,
  getChannelCapability,
  getSupportedPostVisibilities,
  listChannelCapabilities,
  PRODUCTIZED_SCHEDULER_PLATFORMS,
  resolveChannelStatusIssue,
  resolveChannelTargetSettings,
  validateChannelTargetSettings,
} from '../../src/api-types/contracts/channel-capabilities.contract';

describe('channel capability catalog', () => {
  test('reconciles the productized scheduler channels', () => {
    expect(PRODUCTIZED_SCHEDULER_PLATFORMS).toEqual([
      CredentialPlatform.YOUTUBE,
      CredentialPlatform.TIKTOK,
      CredentialPlatform.INSTAGRAM,
      CredentialPlatform.TWITTER,
      CredentialPlatform.LINKEDIN,
      CredentialPlatform.BEEHIIV,
    ]);

    expect(
      listChannelCapabilities().map((capability) => capability.platform),
    ).toEqual([
      CredentialPlatform.YOUTUBE,
      CredentialPlatform.TIKTOK,
      CredentialPlatform.INSTAGRAM,
      CredentialPlatform.TWITTER,
      CredentialPlatform.LINKEDIN,
      CredentialPlatform.BEEHIIV,
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
    // YouTube declares a channel helper but no lookup path: the API has no
    // channel-listing route, and a fabricated path is worse than none because
    // the UI would render a picker that can never load.
    const youtubeChannelHelper = getChannelCapability(
      CredentialPlatform.YOUTUBE,
    )?.helpers.find((helper) => helper.key === 'youtube.channels');

    expect(youtubeChannelHelper).toBeDefined();
    expect(youtubeChannelHelper?.lookupPath).toBeUndefined();

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

  test('gives every publishable platform a catalog entry', () => {
    // Mastodon shipped a working publisher with no capability entry, which made
    // it invisible to validation: every setting it needed was smuggled through
    // credential columns instead.
    expect(
      listChannelCapabilities({
        includeHidden: true,
        includePlanned: true,
      }).map((capability) => capability.platform),
    ).toContain(CredentialPlatform.MASTODON);
  });

  test('derives a status issue from the capability status', () => {
    const supported = getChannelCapability(CredentialPlatform.YOUTUBE);
    const hidden = getChannelCapability(CredentialPlatform.REDDIT);

    expect(supported && resolveChannelStatusIssue(supported)).toBeUndefined();
    expect(hidden && resolveChannelStatusIssue(hidden)).toEqual(
      expect.objectContaining({
        code: 'channel_target.hidden_channel',
        severity: 'error',
      }),
    );

    expect(
      hidden && resolveChannelStatusIssue({ ...hidden, status: 'planned' }),
    ).toEqual(
      expect.objectContaining({
        code: 'channel_target.planned_channel',
        severity: 'error',
      }),
    );
  });
});

describe('validateChannelTargetSettings', () => {
  test('declares visibility without expanding provider capabilities', () => {
    expect(getSupportedPostVisibilities(CredentialPlatform.YOUTUBE)).toEqual([
      PostVisibility.PUBLIC,
      PostVisibility.PRIVATE,
      PostVisibility.UNLISTED,
    ]);
    expect(getSupportedPostVisibilities(CredentialPlatform.TIKTOK)).toEqual([
      PostVisibility.PUBLIC,
      PostVisibility.PRIVATE,
    ]);
    expect(getSupportedPostVisibilities(CredentialPlatform.INSTAGRAM)).toEqual([
      PostVisibility.PUBLIC,
    ]);
  });

  test('rejects unsupported visibility at the shared provider boundary', () => {
    const result = validateChannelTargetSettings({
      platform: CredentialPlatform.INSTAGRAM,
      visibility: PostVisibility.PRIVATE,
    });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'channel_target.unsupported_visibility',
          field: 'visibility',
        }),
      ]),
    );
  });

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

  test('exposes Beehiiv draft, immediate, and scheduled execution', () => {
    expect(getChannelCapability(CredentialPlatform.BEEHIIV)).toEqual(
      expect.objectContaining({
        publishModes: ['draft', 'publish_now', 'scheduled'],
        status: 'supported',
      }),
    );

    expect(
      validateChannelTargetSettings({
        caption: '<p>Newsletter</p>',
        platform: CredentialPlatform.BEEHIIV,
        publishMode: 'publish_now',
        settings: { providerStatus: 'draft' },
      }).valid,
    ).toBe(true);

    expect(
      validateChannelTargetSettings({
        caption: '<p>Newsletter</p>',
        platform: CredentialPlatform.BEEHIIV,
        publishMode: 'scheduled',
        settings: { providerStatus: 'confirmed' },
      }).valid,
    ).toBe(true);
  });

  test('rejects a scheduled Beehiiv provider draft', () => {
    const result = validateChannelTargetSettings({
      caption: '<p>Newsletter</p>',
      platform: CredentialPlatform.BEEHIIV,
      publishMode: 'scheduled',
      settings: { providerStatus: 'draft' },
    });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'channel_target.beehiiv_draft_cannot_be_scheduled',
          field: 'settings.providerStatus',
        }),
      ]),
    );
  });

  test('allows provider readiness to travel with validation results', () => {
    const result = channelTargetValidationResultSchema.parse({
      errors: [
        {
          code: 'channel_target.provider_blocked',
          message: 'Instagram cannot publish until app review is complete.',
          severity: 'error',
        },
      ],
      platform: CredentialPlatform.INSTAGRAM,
      readiness: {
        appReviewStatus: 'fail',
        callbackUrlStatus: 'pass',
        canSchedule: false,
        diagnostics: [
          {
            classification: 'missing_provider_approval',
            code: 'meta_app_review_required',
            correctiveAction: 'Move the Meta app out of development mode.',
            isRetryable: false,
            message: 'Meta app review is required before publishing.',
            severity: 'error',
          },
        ],
        isRetryable: false,
        permissionScopeStatus: 'pass',
        providerKey: CredentialPlatform.INSTAGRAM,
        quotaStatus: 'unknown',
        requiredAction: 'Move the Meta app out of development mode.',
        state: 'blocked',
        tokenFreshness: 'pass',
      },
      valid: false,
      validationState: TargetValidationState.INVALID,
      warnings: [],
    });

    expect(result.readiness?.state).toBe('blocked');
    expect(result.readiness?.canSchedule).toBe(false);
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

  test('declares animated media handling for every catalogued channel', () => {
    for (const capability of listChannelCapabilities({
      includeHidden: true,
      includePlanned: true,
    })) {
      expect(capability.media.animated.supported).toBeTypeOf('boolean');

      // A platform that drops animation must say what happens instead, because
      // that string is what the preview shows on the affected media item.
      if (!capability.media.animated.supported) {
        expect(capability.media.animated.consequence).toBeTypeOf('string');
      }
    }

    expect(
      getChannelCapability(CredentialPlatform.INSTAGRAM)?.media.animated,
    ).toEqual({
      consequence: expect.stringContaining('still frame'),
      supported: false,
    });
    expect(
      getChannelCapability(CredentialPlatform.TWITTER)?.media.animated
        .supported,
    ).toBe(true);
  });

  test('warns without blocking when animated media targets a flattening channel', () => {
    const result = validateChannelTargetSettings({
      caption: 'Carousel launch',
      media: [{ id: 'gif-1', isAnimated: true, kind: 'image' }],
      platform: CredentialPlatform.INSTAGRAM,
      settings: { placement: 'feed' },
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.validationState).toBe(TargetValidationState.WARNING);
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: 'channel_target.animated_media_flattened',
        field: 'media.0.isAnimated',
        severity: 'warning',
      }),
    ]);
    expect(
      channelTargetValidationResultSchema.parse(result).warnings,
    ).toHaveLength(1);
  });

  test('leaves animation untouched on channels that preserve it', () => {
    const result = validateChannelTargetSettings({
      caption: 'Launch loop',
      media: [{ id: 'gif-1', isAnimated: true, kind: 'image' }],
      platform: CredentialPlatform.TWITTER,
    });

    expect(result.warnings).toEqual([]);
    expect(result.validationState).toBe(TargetValidationState.VALID);
  });

  test('keeps blocking errors dominant over animation warnings', () => {
    const capability = getChannelCapability(CredentialPlatform.INSTAGRAM);
    const maxItems = capability?.media.maxItems ?? 0;
    const result = validateChannelTargetSettings({
      caption: 'Carousel launch',
      media: Array.from({ length: maxItems + 1 }, (_, index) => ({
        id: `gif-${index}`,
        isAnimated: true,
        kind: 'image' as const,
      })),
      platform: CredentialPlatform.INSTAGRAM,
      settings: { placement: 'feed' },
    });

    // The only blocker is the media count, so INVALID must win purely because
    // an error outranks the animation warnings that travel with it.
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      expect.objectContaining({ code: 'channel_target.too_many_media_items' }),
    ]);
    expect(result.validationState).toBe(TargetValidationState.INVALID);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  test('flags a valid enum platform with no registered capability', () => {
    const result = validateChannelTargetSettings({
      caption: 'Discord announcement',
      platform: CredentialPlatform.DISCORD,
    });

    expect(result.valid).toBe(false);
    expect(result.validationState).toBe(TargetValidationState.INVALID);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'channel_target.missing_capability',
          field: 'platform',
        }),
      ]),
    );
  });

  test('rejects a setting key the catalog does not declare', () => {
    // The issue is explicit that an unrecognised setting must fail rather than
    // be ignored: a silently dropped key looks applied in the composer.
    const result = validateChannelTargetSettings({
      caption: 'Launch video',
      media: [{ id: 'asset_1', kind: 'video' }],
      platform: CredentialPlatform.YOUTUBE,
      settings: { privacyStatus: 'public', unknownSetting: 'value' },
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'channel_target.unknown_setting',
          field: 'settings.unknownSetting',
        }),
      ]),
    );
  });

  test('rejects a url setting that is not an http(s) URL', () => {
    const result = validateChannelTargetSettings({
      caption: 'Toot',
      platform: CredentialPlatform.MASTODON,
      settings: { instanceUrl: 'mastodon.social' },
    });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'channel_target.invalid_setting_url',
          field: 'settings.instanceUrl',
        }),
      ]),
    );
  });

  test('accepts http(s) urls with and without a path', () => {
    for (const instanceUrl of [
      'https://mastodon.social',
      'http://mastodon.social',
      'https://mastodon.social:8443',
      'https://mastodon.social/@user',
      'https://mastodon.social?a=b',
      'https://mastodon.social#top',
    ]) {
      const result = validateChannelTargetSettings({
        caption: 'Toot',
        platform: CredentialPlatform.MASTODON,
        settings: { instanceUrl },
      });

      expect(
        result.errors.filter(
          (error) => error.code === 'channel_target.invalid_setting_url',
        ),
      ).toEqual([]);
    }
  });

  test('rejects a long non-url without backtracking', () => {
    // The previous pattern let the authority run and the remainder consume the
    // same characters, so this input was re-split at every position.
    const result = validateChannelTargetSettings({
      caption: 'Toot',
      platform: CredentialPlatform.MASTODON,
      // The whitespace is interior: `isParsableHttpUrl` trims, so a trailing
      // space would leave a value that legitimately matches.
      settings: { instanceUrl: `https://${'a'.repeat(50_000)} x` },
    });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'channel_target.invalid_setting_url',
          field: 'settings.instanceUrl',
        }),
      ]),
    );
  });

  test('rejects an unsupported platform string', () => {
    const result = validateChannelTargetSettings({
      caption: 'Unknown network post',
      platform: 'myspace',
    });

    expect(result.valid).toBe(false);
    expect(result.validationState).toBe(TargetValidationState.INVALID);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'channel_target.unsupported_platform',
          field: 'platform',
        }),
      ]),
    );
  });
});

describe('resolveChannelTargetSettings', () => {
  test('substitutes catalog defaults for absent values', () => {
    expect(
      resolveChannelTargetSettings(CredentialPlatform.YOUTUBE, {}),
    ).toEqual({
      madeForKids: false,
      privacyStatus: 'private',
    });
  });

  test('drops keys the catalog does not declare', () => {
    // The stored JSON is whatever passed validation when the release was
    // scheduled. A key the catalog has since dropped must not reach a provider.
    const resolved = resolveChannelTargetSettings(CredentialPlatform.YOUTUBE, {
      privacyStatus: 'unlisted',
      retiredSetting: 'whatever',
    });

    expect(resolved.privacyStatus).toBe('unlisted');
    expect(resolved).not.toHaveProperty('retiredSetting');
  });

  test('falls back to the default when a stored value is no longer valid', () => {
    expect(
      resolveChannelTargetSettings(CredentialPlatform.YOUTUBE, {
        privacyStatus: 'organization',
      }).privacyStatus,
    ).toBe('private');
  });

  test('returns nothing for a platform with no capability', () => {
    expect(
      resolveChannelTargetSettings(CredentialPlatform.DISCORD, {
        anything: true,
      }),
    ).toEqual({});
  });

  test('ignores a stored value that is not an object', () => {
    expect(
      resolveChannelTargetSettings(CredentialPlatform.TWITTER, 'corrupt'),
    ).toEqual({ replyPolicy: 'everyone' });
  });
});
