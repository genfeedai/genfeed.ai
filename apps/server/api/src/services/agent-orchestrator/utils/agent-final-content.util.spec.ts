import { normalizeFinalAssistantContent } from '@api/services/agent-orchestrator/utils/agent-final-content.util';

describe('agent-final-content.util', () => {
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
