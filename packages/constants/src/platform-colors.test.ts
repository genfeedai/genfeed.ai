import { describe, expect, it } from 'vitest';
import {
  DISCORD_EMBED_COLORS,
  getDiscordEmbedColor,
  getPlatformDisplayName,
  PLATFORM_COLORS,
} from './platform-colors';

describe('platform-colors', () => {
  describe('PLATFORM_COLORS', () => {
    it('has platform entries with base, hover, name, rgb', () => {
      for (const [, value] of Object.entries(PLATFORM_COLORS)) {
        expect(value.base).toBeTruthy();
        expect(value.hover).toBeTruthy();
        expect(value.name).toBeTruthy();
        expect(value.rgb).toBeTruthy();
      }
    });

    it('includes instagram', () => {
      expect(PLATFORM_COLORS.instagram).toBeDefined();
      expect(PLATFORM_COLORS.instagram.name).toBe('Instagram');
    });
  });

  describe('DISCORD_EMBED_COLORS', () => {
    it('has DEFAULT key as a number', () => {
      expect(typeof DISCORD_EMBED_COLORS.DEFAULT).toBe('number');
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

    it('returns specific color for known platform', () => {
      expect(getDiscordEmbedColor('INSTAGRAM')).toBe(
        DISCORD_EMBED_COLORS.INSTAGRAM,
      );
    });
  });
});
