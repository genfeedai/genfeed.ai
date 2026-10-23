import { normalizeFinalAssistantContent } from '@api/services/agent-orchestrator/utils/agent-final-content.util';
import type { AgentUiAction } from '@genfeedai/contracts/interfaces';

describe('agent-final-content.util', () => {
  const pendingPost: AgentUiAction = {
    data: { status: 'pending', summary: 'Create post' },
    id: 'mutation-approval:post-1',
    title: 'Create post',
    type: 'mutation_approval_card',
  };

  it.each([
    'Post draft created and waiting in review.',
    "I've created a post draft.",
    'Your post was created.',
  ])('keeps pending post creation honest: %s', (content) => {
    const result = normalizeFinalAssistantContent(content, [], [pendingPost]);
    expect(result.content).toContain('Post proposal ready for review');
    expect(result.content).not.toMatch(
      /(?:post|draft)(?: was)? created|created a post/i,
    );
  });

  it('uses the same pending state for an accurate proposal and preserves unrelated answers', () => {
    expect(
      normalizeFinalAssistantContent(
        'Review this post proposal.',
        [],
        [pendingPost],
      ).content,
    ).toContain('Approve its Create post card');
    expect(
      normalizeFinalAssistantContent('Your post was created.', [], []).content,
    ).toBe('Your post was created.');
  });

  it('preserves confirmed creation and unrelated pending approvals', () => {
    for (const action of [
      { ...pendingPost, data: { status: 'approved' } },
      { ...pendingPost, title: 'Update brand' },
    ]) {
      expect(
        normalizeFinalAssistantContent('Your post was created.', [], [action])
          .content,
      ).toBe('Your post was created.');
    }
  });

  it('returns content when non-empty and no Turbo run card', () => {
    expect(normalizeFinalAssistantContent('Hello world', [], [])).toEqual({
      content: 'Hello world',
      isFallback: false,
    });
  });

  it('strips Turbo run detail lines when a result card is present', () => {
    const content = [
      'Here is your Turbo run.',
      'Turbo Run Details:',
      'Turbo Run ID: abc',
      'Status: running',
      'Credits used: 3',
    ].join('\n');

    expect(
      normalizeFinalAssistantContent(
        content,
        [],
        [{ type: 'turbo_run_result_card' } as never],
      ),
    ).toEqual({
      content: 'Here is your Turbo run.',
      isFallback: false,
    });
  });

  it('returns voice-clone fallback when content empty and setup completed', () => {
    expect(
      normalizeFinalAssistantContent(
        '',
        [
          {
            status: 'completed',
            toolName: 'prepare_voice_clone',
          } as never,
        ],
        [],
      ),
    ).toEqual({
      content:
        'I opened voice clone setup below. Upload a sample or pick an existing voice.',
      isFallback: true,
    });
  });

  it('returns generic fallback for other completed tools', () => {
    expect(
      normalizeFinalAssistantContent(
        '',
        [
          {
            status: 'completed',
            toolName: 'get_brands',
          } as never,
        ],
        [],
      ),
    ).toEqual({
      content: 'I prepared the next step below.',
      isFallback: true,
    });
  });
});
