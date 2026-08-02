import { formatNewsletterStatusLabel } from '@helpers/content/newsletters.helper';
import { describe, expect, it } from 'vitest';

describe('formatNewsletterStatusLabel', () => {
  it('spells out the review status', () => {
    expect(formatNewsletterStatusLabel('ready_for_review')).toBe(
      'Ready For Review',
    );
  });

  it('unslugs every other status', () => {
    expect(formatNewsletterStatusLabel('published')).toBe('published');
    expect(formatNewsletterStatusLabel('archived')).toBe('archived');
  });
});
