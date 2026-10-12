import { describe, expect, it } from 'vitest';
import {
  createTextActionGate,
  extractProtectedTokens,
  findDroppedTokens,
  measureChannelText,
  resolveTextActionLimit,
} from './text-action-text.helper';

describe('text action text utilities', () => {
  it('extracts mentions, hashtags and links without trailing punctuation', () => {
    expect(
      extractProtectedTokens(
        'Thanks @ada_l and @bob! See https://example.com/a?b=1. #LaunchDay, #ship2026 mail me@example.com',
      ),
    ).toEqual({
      hashtags: ['#LaunchDay', '#ship2026'],
      links: ['https://example.com/a?b=1'],
      mentions: ['@ada_l', '@bob'],
    });
  });

  it('counts X characters by weight and the others one by one', () => {
    expect(measureChannelText('日本語', true)).toBe(6);
    expect(measureChannelText('日本語', false)).toBe(3);
    expect(measureChannelText('https://example.com/very/long/path', true)).toBe(
      23,
    );
  });

  it('lists tokens the edit dropped or changed, honoring duplicates', () => {
    const source = 'Hi @ada #tag https://a.co #tag';
    expect(
      findDroppedTokens(source, 'Hello @ada #tag https://a.co #tag', [
        'mention',
        'hashtag',
        'link',
      ]),
    ).toEqual([]);
    expect(
      findDroppedTokens(source, 'Hello @ada #tag https://a.com', [
        'mention',
        'hashtag',
        'link',
      ]),
    ).toEqual(['#tag', 'https://a.co']);
    expect(findDroppedTokens(source, 'Hello', ['mention'])).toEqual(['@ada']);
  });

  describe('createTextActionGate', () => {
    const base = {
      maxCharacters: 40,
      source: 'Thx @ada! #tag https://a.co',
      usesWeightedCharacters: false,
    };

    it('accepts a proofread that keeps every protected token', () => {
      const gate = createTextActionGate({ ...base, mode: 'proofread' });
      expect(gate.normalize('Thanks @ada! #tag https://a.co')).toBe(
        'Thanks @ada! #tag https://a.co',
      );
      expect(gate.rejection()).toBeNull();
    });

    it('rejects a proofread that changes a hashtag but lets a rewrite do it', () => {
      const proofread = createTextActionGate({
        ...base,
        mode: 'proofread',
      });
      expect(proofread.normalize('Thanks @ada! #Tag https://a.co')).toBeNull();
      expect(proofread.rejection()).toBe('tokens');
      const rewrite = createTextActionGate({ ...base, mode: 'rewrite' });
      expect(rewrite.normalize('Big thanks @ada #Tag https://a.co')).toBe(
        'Big thanks @ada #Tag https://a.co',
      );
    });

    it('rejects a rewrite that drops a mention or link', () => {
      const gate = createTextActionGate({ ...base, mode: 'rewrite' });
      expect(gate.normalize('Big thanks https://a.co')).toBeNull();
      expect(gate.rejection()).toBe('tokens');
      expect(gate.normalize('Big thanks @ada')).toBeNull();
    });

    it('rejects empty and over-limit answers', () => {
      const gate = createTextActionGate({ ...base, mode: 'rewrite' });
      expect(gate.normalize('')).toBeNull();
      expect(gate.rejection()).toBe('limit');
      expect(gate.normalize(`@ada https://a.co ${'x'.repeat(40)}`)).toBeNull();
      expect(gate.rejection()).toBe('limit');
    });
  });

  describe('resolveTextActionLimit', () => {
    it('holds a rewrite to the channel limit', () => {
      expect(
        resolveTextActionLimit({
          channelLimit: 280,
          mode: 'rewrite',
          source: 'x'.repeat(500),
          usesWeightedCharacters: true,
        }),
      ).toBe(280);
    });

    it('lets a proofread keep the room an over-long draft already uses', () => {
      expect(
        resolveTextActionLimit({
          channelLimit: 280,
          mode: 'proofread',
          source: 'x'.repeat(400),
          usesWeightedCharacters: true,
        }),
      ).toBe(420);
      expect(
        resolveTextActionLimit({
          channelLimit: 280,
          mode: 'proofread',
          source: 'short',
          usesWeightedCharacters: true,
        }),
      ).toBe(280);
    });
  });
});
