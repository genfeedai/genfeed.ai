import { describe, expect, it } from 'vitest';
import {
  AVATAR_VIDEO_PROVIDER_NAMES,
  isSupportedAvatarVideoProviderName,
  SUPPORTED_AVATAR_VIDEO_PROVIDER_NAMES,
} from './avatar-video-provider.interface';

describe('avatar video provider contract', () => {
  it('keeps supported providers a subset of every known provider', () => {
    for (const provider of SUPPORTED_AVATAR_VIDEO_PROVIDER_NAMES) {
      expect(AVATAR_VIDEO_PROVIDER_NAMES).toContain(provider);
    }
  });

  it('recognizes only production-ready providers as supported', () => {
    expect(isSupportedAvatarVideoProviderName('heygen')).toBe(true);
    expect(isSupportedAvatarVideoProviderName('argil')).toBe(true);
    expect(isSupportedAvatarVideoProviderName('genfeedai')).toBe(true);
    expect(isSupportedAvatarVideoProviderName('did')).toBe(false);
    expect(isSupportedAvatarVideoProviderName('tavus')).toBe(false);
    expect(isSupportedAvatarVideoProviderName('musetalk')).toBe(false);
    expect(isSupportedAvatarVideoProviderName('unknown')).toBe(false);
  });
});
