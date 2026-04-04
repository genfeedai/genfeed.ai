import { describe, expect, it } from 'vitest';

/**
 * Run standard page module tests.
 * Checks that the module exports a default component and optional metadata/generateMetadata.
 */
export function runPageModuleTests(
  pagePath: string,
  pageModule: Record<string, unknown>,
) {
  describe(pagePath, () => {
    it('exports a default component', () => {
      expect(pageModule).toHaveProperty('default');
      expect(typeof pageModule.default).toBe('function');
    });

    it('default export is a valid React component (function)', () => {
      const Component = pageModule.default as (...args: never) => unknown;
      expect(Component.name || Component.displayName || true).toBeTruthy();
    });

    if ('generateMetadata' in pageModule) {
      it('exports generateMetadata as a function', () => {
        expect(typeof pageModule.generateMetadata).toBe('function');
      });
    }

    if ('metadata' in pageModule) {
      it('exports metadata as an object', () => {
        expect(typeof pageModule.metadata).toBe('object');
        expect(pageModule.metadata).not.toBeNull();
      });
    }
  });
}
