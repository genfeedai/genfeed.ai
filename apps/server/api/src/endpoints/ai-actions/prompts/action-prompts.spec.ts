import { resolveAddHashtagsSystemPrompt } from '@api/endpoints/ai-actions/prompts/action-prompts';

describe('resolveAddHashtagsSystemPrompt', () => {
  it('holds Instagram to the 5 hashtags its channel capability declares', () => {
    const prompt = resolveAddHashtagsSystemPrompt('instagram');

    expect(prompt).toContain('Generate at most 5 relevant hashtags');
    expect(prompt).not.toContain('5-10');
  });

  it('asks for 3 to 5 when no channel is named', () => {
    expect(resolveAddHashtagsSystemPrompt()).toContain(
      'Generate 3 to 5 relevant hashtags',
    );
  });

  it('asks for 3 to 5 for a channel the catalog sets no hashtag limit for', () => {
    expect(resolveAddHashtagsSystemPrompt('twitch')).toContain(
      'Generate 3 to 5 relevant hashtags',
    );
  });
});
