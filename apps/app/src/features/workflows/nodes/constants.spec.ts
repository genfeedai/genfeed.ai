import {
  CTA_OPTIONS,
  formatTime,
  getPlatformIconType,
  getPlatformLabel,
  getPlatformsByAspectRatio,
  PLATFORM_OPTIONS,
  TONE_OPTIONS,
} from '@workflow-cloud/nodes/constants';
import { describe, expect, it } from 'vitest';

describe('PLATFORM_OPTIONS', () => {
  it('has platforms', () => {
    expect(PLATFORM_OPTIONS.length).toBeGreaterThan(5);
    expect(PLATFORM_OPTIONS.map((p) => p.value)).toContain('tiktok');
  });
});

describe('getPlatformsByAspectRatio', () => {
  it('filters 9:16', () => {
    const r = getPlatformsByAspectRatio('9:16');
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((p) => p.aspectRatio === '9:16')).toBe(true);
  });
  it('empty for unknown', () => {
    expect(getPlatformsByAspectRatio('3:2')).toEqual([]);
  });
});

describe('getPlatformLabel', () => {
  it('known', () => expect(getPlatformLabel('tiktok')).toBe('TikTok'));
  it('unknown', () => expect(getPlatformLabel('x' as any)).toBe('x'));
});

describe('getPlatformIconType', () => {
  it('phone', () => expect(getPlatformIconType('tiktok')).toBe('phone'));
  it('monitor', () => expect(getPlatformIconType('twitter')).toBe('monitor'));
  it('default', () => expect(getPlatformIconType('x' as any)).toBe('monitor'));
});

describe('TONE_OPTIONS', () => {
  it('has tones', () =>
    expect(TONE_OPTIONS.map((t) => t.value)).toContain('professional'));
});

describe('CTA_OPTIONS', () => {
  it('has options', () =>
    expect(CTA_OPTIONS.map((c) => c.value)).toContain('follow'));
});

describe('formatTime', () => {
  it('0', () => expect(formatTime(0)).toBe('0:00'));
  it('65s', () => expect(formatTime(65)).toBe('1:05'));
  it('600s', () => expect(formatTime(600)).toBe('10:00'));
});
