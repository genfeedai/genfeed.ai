import { describe, expect, it } from 'vitest';
import {
  enhanceAssistantMarkdown,
  normalizeAssistantListMarkdown,
} from './SafeMarkdown';

describe('normalizeAssistantListMarkdown', () => {
  it('indents body lines under ordered items so numbering stays continuous', () => {
    const input = [
      'Rewrote four drafts.',
      '',
      '1. **One-second impact**',
      ' Most visuals lose before the caption gets a chance.',
      '',
      ' The fix is brutal:',
      ' One focal point.',
      '',
      '2. **Visuals as the hook**',
      ' A good image is not decoration.',
    ].join('\n');

    const result = normalizeAssistantListMarkdown(input);

    expect(result).toContain('1. **One-second impact**');
    expect(result).toContain(
      '   Most visuals lose before the caption gets a chance.',
    );
    expect(result).toContain('   The fix is brutal:');
    expect(result).toContain('2. **Visuals as the hook**');
    expect(result).toContain('   A good image is not decoration.');
    // Still one continuous list in source (no structural split).
    expect(result).toMatch(
      /1\. \*\*One-second impact\*\*[\s\S]*2\. \*\*Visuals as the hook\*\*/,
    );
  });

  it('collapses triple blank lines', () => {
    expect(normalizeAssistantListMarkdown('a\n\n\n\nb')).toBe('a\n\nb');
  });
});

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
