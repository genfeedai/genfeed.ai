import type { IPaginatedResponse } from '@genfeedai/contracts/interfaces';
import type { IconComponent } from '@genfeedai/contracts/types/icon';
import type { ReactNode } from 'react';

export interface PublicListPageProps {
  children: ReactNode;
  className?: string;
  description?: string;
  icon?: IconComponent;
  /** The page's heading. Omit it when the content brings its own `h1`. */
  label?: string;
  /** Keep the heading for screen readers only; the site shell names the page. */
  isLabelHidden?: boolean;
  /** When set, page links render under the list. */
  pagination?: Pick<
    IPaginatedResponse<unknown>,
    'page' | 'total' | 'totalPages'
  >;
  /** What the total counts, e.g. "articles". */
  totalLabel?: string;
}
