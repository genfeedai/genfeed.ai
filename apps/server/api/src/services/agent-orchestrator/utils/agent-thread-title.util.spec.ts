import {
  buildFallbackThreadTitle,
  buildSeedThreadTitle,
  extractThreadEnvelope,
  sanitizeGeneratedThreadTitle,
} from '@api/services/agent-orchestrator/utils/agent-thread-title.util';
import { fenceUntrustedContent } from '@api/services/agent-orchestrator/utils/agent-untrusted-content.util';

describe('agent-thread-title.util', () => {
  describe('buildSeedThreadTitle', () => {
    it('trims and caps at 100 characters', () => {
      expect(buildSeedThreadTitle(`  ${'a'.repeat(150)}  `)).toHaveLength(100);
    });
  });

  describe('buildFallbackThreadTitle', () => {
    it('strips filler words and title-cases remaining tokens', () => {
      expect(
        buildFallbackThreadTitle('can you please draft a launch plan'),
      ).toBe('Launch Plan');
    });

    it('keeps residual non-filler tokens in title case', () => {
      expect(buildFallbackThreadTitle('please help')).toBe('Help');
    });

    it('falls back to seed title when nothing useful remains', () => {
      expect(buildFallbackThreadTitle('please')).toBe('please');
    });

    it('titles from the raw user prompt, not the untrusted-data fence', () => {
      const rawPrompt = 'draft a launch plan';
      const fenced = fenceUntrustedContent(rawPrompt);

      expect(buildFallbackThreadTitle(fenced)).toBe('Launch Plan');
      expect(buildSeedThreadTitle(fenced)).toBe(rawPrompt);
      expect(
        sanitizeGeneratedThreadTitle(
          'This Is Untrusted User Generated',
          rawPrompt,
        ),
      ).toBe('Launch Plan');
      expect(
        extractThreadEnvelope({
          assistantContent:
            '{"title":"This Is Untrusted User Generated","content":"Here is the plan."}',
          prompt: rawPrompt,
          seedTitle: rawPrompt,
        }).title,
      ).toBe('Launch Plan');
    });
  });

  describe('sanitizeGeneratedThreadTitle', () => {
    it('keeps a clean multi-word title', () => {
      expect(
        sanitizeGeneratedThreadTitle(
          'Launch Plan Draft',
          'write a launch plan',
        ),
      ).toBe('Launch Plan Draft');
    });

    it('falls back when title is too short', () => {
      expect(sanitizeGeneratedThreadTitle('Hi', 'write a launch plan')).toBe(
        'Launch Plan',
      );
    });
  });

  describe('extractThreadEnvelope', () => {
    it('returns content unchanged when seed title is empty', () => {
      expect(
        extractThreadEnvelope({
          assistantContent: 'Hello',
          prompt: 'hi',
          seedTitle: '',
        }),
      ).toEqual({ content: 'Hello', title: null });
    });

    it('parses a JSON title/content envelope', () => {
      const result = extractThreadEnvelope({
        assistantContent:
          '{"title":"Launch Plan","content":"Here is the plan."}',
        prompt: 'draft a launch plan',
        seedTitle: 'draft a launch plan',
      });
      expect(result.content).toBe('Here is the plan.');
      expect(result.title).toBe('Launch Plan');
    });
  });
});
