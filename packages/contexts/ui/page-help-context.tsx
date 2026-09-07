'use client';

import type {
  PageHelpContent,
  PageHelpProviderProps,
} from '@genfeedai/props/ui/layout/page-help.props';
import { createContext, use } from 'react';

const PageHelpContext = createContext<PageHelpContent | null>(null);

/**
 * Route-level "About this page" copy. The host app resolves it from the
 * pathname once; Container and SectionTopbar read it so every section page
 * gets the same help trigger without per-page wiring.
 */
export function PageHelpProvider({
  children,
  help = null,
}: PageHelpProviderProps) {
  return <PageHelpContext value={help}>{children}</PageHelpContext>;
}

export function usePageHelp(): PageHelpContent | null {
  return use(PageHelpContext);
}
