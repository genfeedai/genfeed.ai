import type { LayoutProps } from '@props/layout/layout.props';
import type { ReactNode } from 'react';

export interface IntlMessageTree {
  readonly [key: string]: IntlMessageTree | string;
}

export interface PageIntlProviderProps {
  children: ReactNode;
  pages: IntlMessageTree;
}

export interface OrganizationAppIntlLayoutProps extends LayoutProps {
  params: Promise<{ orgRootApp: string }>;
}
