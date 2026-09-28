import { describe, expect, it, vi } from 'vitest';

vi.mock('./new-clip-project-page', () => ({
  default: () => null,
}));

const PageModule = await import('./page');

describe('studio/clips/new page module', () => {
  it('exports the route page and its metadata', () => {
    expect(PageModule.default).toBeTypeOf('function');
    expect(PageModule.generateMetadata).toBeTypeOf('function');
  });
});
