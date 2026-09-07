import type { ReactNode } from 'react';

/** Copy for the "About this page" popover shown in the section chrome. */
export interface PageHelpContent {
  title: string;
  body: ReactNode;
}

export interface PageHelpProviderProps {
  children: ReactNode;
  help?: PageHelpContent | null;
}

export interface HelpPopoverProps {
  help: PageHelpContent;
}
