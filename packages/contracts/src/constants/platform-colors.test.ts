import { describe, expect, it } from 'vitest';
import {
  DISCORD_EMBED_COLORS,
  getDiscordEmbedColor,
  getPlatformDisplayName,
  PLATFORM_COLORS,
} from './platform-colors';

describe('platform-colors', () => {
  describe('PLATFORM_COLORS', () => {
    it('includes instagram', () => {
      expect(PLATFORM_COLORS.instagram).toBeDefined();
      expect(PLATFORM_COLORS.instagram.name).toBe('Instagram');
    });
  });

  describe('getPlatformDisplayName', () => {
    it('returns "Unknown" for undefined', () => {
      expect(getPlatformDisplayName(undefined)).toBe('Unknown');
    });

    it('returns name for known platform (case-insensitive)', () => {
      expect(getPlatformDisplayName('instagram')).toBe('Instagram');
      expect(getPlatformDisplayName('INSTAGRAM')).toBe('Instagram');
    });

    it('capitalizes unknown platform', () => {
      expect(getPlatformDisplayName('MYPLATFORM')).toBe('Myplatform');
    });
  });

  describe('getDiscordEmbedColor', () => {
    it('returns DEFAULT for undefined', () => {
      expect(getDiscordEmbedColor(undefined)).toBe(
        DISCORD_EMBED_COLORS.DEFAULT,
      );
    });

    it('returns DEFAULT for unknown platform', () => {
      expect(getDiscordEmbedColor('nonexistent')).toBe(
        DISCORD_EMBED_COLORS.DEFAULT,
      );
    });
  });
});
