import { describe, expect, it } from 'vitest';
import { badgeVariants } from './badge.variants';

describe('badgeVariants', () => {
  it('gives every pill a hairline so callers do not opt into border', () => {
    expect(badgeVariants({ variant: 'slate' })).toContain('border');
    expect(badgeVariants({ variant: 'video' })).toContain('border');
    expect(badgeVariants({ variant: 'error' })).toContain('border');
  });

  it.each([
    'accent',
    'audio',
    'avatar',
    'blue',
    'ghost',
    'gif',
    'image',
    'multimodal',
    'outline',
    'purple',
    'secondary',
    'slate',
    'video',
    'voice',
  ] as const)('uses role tokens for the %s badge family', (variant) => {
    expect(badgeVariants({ variant })).not.toMatch(
      /(?:white|slate|violet|orange|indigo|blue|cyan|pink|purple|amber)-/,
    );
  });
});
