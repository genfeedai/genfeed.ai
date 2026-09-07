import { describe, expect, it } from 'vitest';
import { badgeVariants } from './badge.variants';

describe('badgeVariants', () => {
  it('renders every pill as a soft tint with no border ring', () => {
    expect(badgeVariants({ variant: 'slate' })).not.toMatch(/\bborder\b/);
    expect(badgeVariants({ variant: 'video' })).not.toMatch(/\bborder\b/);
    expect(badgeVariants({ variant: 'error' })).not.toMatch(/\bborder\b/);
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
