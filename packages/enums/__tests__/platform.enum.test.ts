import { describe, expect, it } from 'vitest';
import { Platform } from '../src/platform.enum';

describe('platform.enum', () => {
  describe('Platform', () => {
    it('should have 23 members', () => {
      expect(Object.values(Platform)).toHaveLength(23);
    });

    it('should have correct values', () => {
      expect(Platform.YOUTUBE).toBe('youtube');
      expect(Platform.INSTAGRAM).toBe('instagram');
      expect(Platform.TIKTOK).toBe('tiktok');
      expect(Platform.FACEBOOK).toBe('facebook');
      expect(Platform.GOOGLE_ADS).toBe('google_ads');
      expect(Platform.TWITTER).toBe('twitter');
      expect(Platform.LINKEDIN).toBe('linkedin');
      expect(Platform.PINTEREST).toBe('pinterest');
      expect(Platform.REDDIT).toBe('reddit');
      expect(Platform.DISCORD).toBe('discord');
      expect(Platform.TELEGRAM).toBe('telegram');
      expect(Platform.TWITCH).toBe('twitch');
      expect(Platform.MEDIUM).toBe('medium');
      expect(Platform.THREADS).toBe('threads');
      expect(Platform.FANVUE).toBe('fanvue');
      expect(Platform.SLACK).toBe('slack');
      expect(Platform.WORDPRESS).toBe('wordpress');
      expect(Platform.SNAPCHAT).toBe('snapchat');
      expect(Platform.WHATSAPP).toBe('whatsapp');
      expect(Platform.MASTODON).toBe('mastodon');
      expect(Platform.GHOST).toBe('ghost');
      expect(Platform.SHOPIFY).toBe('shopify');
      expect(Platform.BEEHIIV).toBe('beehiiv');
    });
  });
});
