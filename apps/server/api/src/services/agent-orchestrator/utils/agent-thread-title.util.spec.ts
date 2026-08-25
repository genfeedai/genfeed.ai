import type { AgentChatContext } from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import {
  type AgentThreadTitlePersistence,
  buildFallbackThreadTitle,
  buildSeedThreadTitle,
  extractThreadEnvelope,
  maybeUpdateThreadTitle,
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

  describe('maybeUpdateThreadTitle', () => {
    const context = {
      organizationId: 'org-1',
      userId: 'user-1',
    } as AgentChatContext;

    function buildPersistence(currentTitle: string): {
      persistence: AgentThreadTitlePersistence;
      updates: Array<{ title: string }>;
    } {
      const updates: Array<{ title: string }> = [];
      return {
        persistence: {
          findOne: () => Promise.resolve({ title: currentTitle }),
          updateThreadMetadata: (_threadId, _organizationId, metadata) => {
            updates.push(metadata);
            return Promise.resolve(undefined);
          },
        },
        updates,
      };
    }

    it('persists the generated title and returns it for live push', async () => {
      const { persistence, updates } = buildPersistence('draft a launch plan');

      await expect(
        maybeUpdateThreadTitle({
          agentThreadsService: persistence,
          context,
          seedTitle: 'draft a launch plan',
          threadId: 'thread-1',
          title: 'Launch Plan',
        }),
      ).resolves.toBe('Launch Plan');
      expect(updates).toEqual([{ title: 'Launch Plan' }]);
    });

    it('returns null without writing when the thread was already renamed', async () => {
      const { persistence, updates } = buildPersistence('Custom Name');

      await expect(
        maybeUpdateThreadTitle({
          agentThreadsService: persistence,
          context,
          seedTitle: 'draft a launch plan',
          threadId: 'thread-1',
          title: 'Launch Plan',
        }),
      ).resolves.toBeNull();
      expect(updates).toEqual([]);
    });

    it('returns null when the generated title matches the seed', async () => {
      const { persistence, updates } = buildPersistence('draft a launch plan');

      await expect(
        maybeUpdateThreadTitle({
          agentThreadsService: persistence,
          context,
          seedTitle: 'draft a launch plan',
          threadId: 'thread-1',
          title: 'draft a launch plan',
        }),
      ).resolves.toBeNull();
      expect(updates).toEqual([]);
    });
  });
});
