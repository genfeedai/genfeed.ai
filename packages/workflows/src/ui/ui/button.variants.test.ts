import { describe, expect, it } from 'vitest';
import { buttonVariants } from './button.variants';

describe('buttonVariants', () => {
  it('uses the semantic primary color pair for the default action', () => {
    const className = buttonVariants({ variant: 'default' });

    expect(className).toContain('bg-primary');
    expect(className).toContain('text-primary-foreground');
    expect(className).toContain('hover:bg-primary/90');
    expect(className).not.toContain('bg-white');
    expect(className).not.toContain('text-black');
  });
});
