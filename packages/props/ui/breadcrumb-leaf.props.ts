import type { ReactNode } from 'react';

/** A page-supplied label for the topbar breadcrumb's last segment. */
export interface BreadcrumbLeaf {
  /** Identifies the record the label belongs to, so a stale label never shows. */
  readonly key: string;
  readonly label: string;
}

export interface BreadcrumbLeafContextValue {
  readonly clearLeaf: (key: string) => void;
  readonly leaf: BreadcrumbLeaf | null;
  readonly setLeaf: (leaf: BreadcrumbLeaf) => void;
}

export interface BreadcrumbLeafProviderProps {
  readonly children: ReactNode;
}
