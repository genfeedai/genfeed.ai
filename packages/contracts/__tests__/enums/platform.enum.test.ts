import { describe, expect, it } from 'vitest';
import { Platform } from '../../src/enums/platform.enum';

describe('platform.enum', () => {
  describe('Platform', () => {
    it('should have the intended members', () => {
      expect(Object.keys(Platform)).toEqual([
        'YOUTUBE',
        'INSTAGRAM',
        'TIKTOK',
        'FACEBOOK',
        'GOOGLE_ADS',
        'GOOGLE_SEARCH_CONSOLE',
        'TWITTER',
        'X_ADS',
        'LINKEDIN',
        'PINTEREST',
        'REDDIT',
        'DISCORD',
        'TELEGRAM',
        'TWITCH',
        'MEDIUM',
        'THREADS',
        'FANVUE',
        'SLACK',
        'WORDPRESS',
        'SNAPCHAT',
        'WHATSAPP',
        'MASTODON',
        'GHOST',
        'SHOPIFY',
        'BEEHIIV',
        'UNIPILE',
        'DEV_TO',
        'PRODUCT_HUNT',
        'HACKER_NEWS',
        'RESTREAM',
      ]);
    });

    it('should have correct values', () => {
      expect(Platform.YOUTUBE).toBe('youtube');
      expect(Platform.INSTAGRAM).toBe('instagram');
      expect(Platform.TIKTOK).toBe('tiktok');
      expect(Platform.FACEBOOK).toBe('facebook');
      expect(Platform.GOOGLE_ADS).toBe('google_ads');
      expect(Platform.GOOGLE_SEARCH_CONSOLE).toBe('google_search_console');
      expect(Platform.TWITTER).toBe('twitter');
      expect(Platform.X_ADS).toBe('x_ads');
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
      expect(Platform.UNIPILE).toBe('unipile');
      expect(Platform.DEV_TO).toBe('devto');
      expect(Platform.PRODUCT_HUNT).toBe('product_hunt');
      expect(Platform.HACKER_NEWS).toBe('hacker_news');
      expect(Platform.RESTREAM).toBe('restream');
    });
  });
});
