import {
  expandTcoLinks,
  replaceTcoLinks,
} from '@api/services/brand-scraper/brand-short-link.util';
import { describe, expect, it, vi } from 'vitest';

describe('expandTcoLinks', () => {
  it('resolves each distinct t.co link once and replaces it in the text', async () => {
    const resolve = vi.fn(async (url: string) =>
      url.endsWith('abc123') ? 'https://genfeed.ai/x' : undefined,
    );
    const bio = 'Building https://t.co/abc123, the open-source agent.';

    const expanded = await expandTcoLinks([bio, bio, undefined], resolve);

    expect(resolve).toHaveBeenCalledTimes(1);
    expect(replaceTcoLinks(bio, expanded)).toBe(
      'Building https://genfeed.ai/x, the open-source agent.',
    );
  });

  it('leaves a link that cannot be resolved untouched', async () => {
    const resolve = vi.fn(async () => {
      throw new Error('blocked');
    });
    const bio = 'See https://t.co/zzz999 now';

    const expanded = await expandTcoLinks([bio], resolve);

    expect(replaceTcoLinks(bio, expanded)).toBe(bio);
  });
});
