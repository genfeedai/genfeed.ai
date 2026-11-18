import { useState } from 'react';

function hasChanged(
  previous: readonly unknown[],
  next: readonly unknown[],
): boolean {
  return (
    previous.length !== next.length ||
    next.some((value, index) => !Object.is(value, previous[index]))
  );
}

/**
 * Runs `reset` during render when any value in `deps` changes, so a component
 * can reset several of its own state values to match new props without an
 * effect and without painting the stale values first. `reset` must only call
 * state setters of the component that renders this hook.
 */
export function useResetOnChange(
  deps: readonly unknown[],
  reset: () => void,
): void {
  const [previousDeps, setPreviousDeps] = useState<readonly unknown[]>(deps);

  if (hasChanged(previousDeps, deps)) {
    setPreviousDeps(deps);
    reset();
  }
}
