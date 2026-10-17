import type { ReactNode } from 'react';

export interface IntlMessageTree {
  readonly [key: string]: IntlMessageTree | string;
}

export interface PageIntlProviderProps {
  children: ReactNode;
  pages: IntlMessageTree;
}
