import { describe, expect, it } from 'vitest';
import { badgeVariants } from './badge.variants';

describe('badgeVariants', () => {
  it('gives every pill a hairline so callers do not opt into border', () => {
    expect(badgeVariants({ variant: 'slate' })).toContain('border');
    expect(badgeVariants({ variant: 'video' })).toContain('border');
    expect(badgeVariants({ variant: 'error' })).toContain('border');
  });
});
