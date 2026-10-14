'use client';

import type {
  BreadcrumbLeaf,
  BreadcrumbLeafContextValue,
  BreadcrumbLeafProviderProps,
} from '@props/ui/breadcrumb-leaf.props';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

const BreadcrumbLeafContext = createContext<BreadcrumbLeafContextValue | null>(
  null,
);

/**
 * Lets a page name the last breadcrumb segment of the shell topbar when the
 * label is data the layout does not own (a run title, a draft name). The
 * layout reads it with {@link useBreadcrumbLeaf}; pages publish it with
 * {@link useRegisterBreadcrumbLeaf}.
 */
export function BreadcrumbLeafProvider({
  children,
}: BreadcrumbLeafProviderProps) {
  const [leaf, setLeafState] = useState<BreadcrumbLeaf | null>(null);
  const setLeaf = useCallback((next: BreadcrumbLeaf) => setLeafState(next), []);
  const clearLeaf = useCallback(
    (key: string) =>
      setLeafState((current) => (current?.key === key ? null : current)),
    [],
  );
  const value = useMemo<BreadcrumbLeafContextValue>(
    () => ({ clearLeaf, leaf, setLeaf }),
    [clearLeaf, leaf, setLeaf],
  );

  return (
    <BreadcrumbLeafContext value={value}>{children}</BreadcrumbLeafContext>
  );
}

/** The label a page has published, or `null`. Always `null` outside the shell. */
export function useBreadcrumbLeaf(): BreadcrumbLeaf | null {
  return use(BreadcrumbLeafContext)?.leaf ?? null;
}

/** Publishes `label` for the record `key` until the page unmounts. */
export function useRegisterBreadcrumbLeaf(
  key: string,
  label: string | undefined,
): void {
  const context = use(BreadcrumbLeafContext);
  const setLeaf = context?.setLeaf;
  const clearLeaf = context?.clearLeaf;

  useEffect(() => {
    if (!setLeaf || !clearLeaf || !label) {
      return;
    }

    setLeaf({ key, label });
    return () => clearLeaf(key);
  }, [clearLeaf, key, label, setLeaf]);
}
