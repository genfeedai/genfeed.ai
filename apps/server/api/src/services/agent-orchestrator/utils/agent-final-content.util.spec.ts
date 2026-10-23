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

  it.each([
    'Review this post proposal.',
    'I created a post proposal for your review. Approve the card to create it.',
    "I've created a post draft proposal for review.",
    'The post has not been created. Review the proposal below.',
    'No post was created. Review the proposal below.',
    'No post draft created. Review the proposal below.',
    'The answer is 42.\n\nReview this post proposal.',
    "I haven't created a post. Review its proposal.",
  ])('preserves accurate pending-proposal content: %s', (content) => {
    expect(normalizeFinalAssistantContent(content, [], [pendingPost])).toEqual({
      content,
      isFallback: false,
    });
  });

  it.each([
    [
      'The answer is 42.\n\nYour post was created. Review the card below.',
      'The answer is 42.\n\nPost proposal ready for review. Review the card below.',
    ],
    [
      "I've created a post draft, and the answer to your question is 42.",
      'Post proposal ready for review, and the answer to your question is 42.',
    ],
    [
      'Post draft created and waiting in review.\n\nUse a 4:5 aspect ratio.',
      'Post proposal ready for review and waiting in review.\n\nUse a 4:5 aspect ratio.',
    ],
    [
      'I created a brand. Your post was created.',
      'I created a brand. Post proposal ready for review.',
    ],
  ])(
    'corrects only the creation claim in a mixed answer: %s',
    (content, expected) => {
      expect(
        normalizeFinalAssistantContent(content, [], [pendingPost]),
      ).toEqual({
        content: expected,
        isFallback: false,
      });
    },
  );

  it('provides proposal instructions when pending-post content is empty', () => {
    expect(normalizeFinalAssistantContent('  ', [], [pendingPost])).toEqual({
      content:
        'Post proposal ready for review. Approve its Create post card to create the post.',
      isFallback: false,
    });
  });

  it('preserves creation claims when no post approval is pending', () => {
    const content = 'Your post was created. The answer is 42.';
    expect(normalizeFinalAssistantContent(content, [], []).content).toBe(
      content,
    );
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
