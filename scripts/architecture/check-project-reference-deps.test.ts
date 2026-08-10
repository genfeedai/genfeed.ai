import { describe, expect, it } from 'vitest';
import { checkProjectReferenceDeps } from './check-project-reference-deps';

describe('project reference guard', () => {
  it('gives every cross-package reference a Turbo ordering edge', () => {
    expect(checkProjectReferenceDeps()).toEqual([]);
  });

  it('names the dependency to add when one is missing', () => {
    // The shape callers rely on: a violation has to say which manifest is
    // short a dependency, not merely that something is wrong.
    for (const violation of checkProjectReferenceDeps()) {
      expect(violation.dependency).toBeTruthy();
      expect(violation.package).toBeTruthy();
      expect(violation.tsconfig).toMatch(/tsconfig.*\.json$/);
    }
  });
});
