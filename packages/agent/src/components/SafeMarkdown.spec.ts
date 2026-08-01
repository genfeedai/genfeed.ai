import { describe, expect, it } from 'vitest';
import { enhanceAssistantMarkdown } from './SafeMarkdown';

describe('enhanceAssistantMarkdown', () => {
  it('turns labeled capability lines into bold list items', () => {
    const input = [
      'Yes. Here are the core capabilities:',
      '',
      'Batch content generation: Create 5–50 posts for a handle.',
      'Single content: Generate images, videos, or posts.',
      'Scheduling: Schedule posts across platforms.',
    ].join('\n');

    const result = enhanceAssistantMarkdown(input);

    expect(result).toContain(
      '- **Batch content generation:** Create 5–50 posts for a handle.',
    );
    expect(result).toContain(
      '- **Single content:** Generate images, videos, or posts.',
    );
    expect(result).toContain('Yes. Here are the core capabilities:');
  });

  it('leaves real markdown lists alone', () => {
    const input = '- **Already a list:** item\n- **Second:** item';
    expect(enhanceAssistantMarkdown(input)).toBe(input);
  });

  it('leaves single-label lines alone', () => {
    const input = 'Status: ready to go.';
    expect(enhanceAssistantMarkdown(input)).toBe(input);
  });
});
