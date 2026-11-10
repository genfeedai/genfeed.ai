'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import {
  DEFAULT_PUBLIC_MEDIA_SORT,
  PUBLIC_MEDIA_SORT_LABELS,
  PUBLIC_MEDIA_SORTS,
  type PublicMediaSort,
} from '@genfeedai/contracts/constants';
import type { CommunitySortMenuProps } from '@props/content/creator.props';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { ArrowDownWideNarrow, Check } from 'lucide-react';
import Link from 'next/link';

/** The gallery page in the given order; the default order has no query. */
export function communitySortHref(
  basePath: string,
  sort: PublicMediaSort,
): string {
  return sort === DEFAULT_PUBLIC_MEDIA_SORT
    ? basePath
    : `${basePath}?sort=${sort}`;
}

/** Orders a community gallery: newest, most viewed or most recreated. */
export default function CommunitySortMenu({
  active,
  basePath,
}: CommunitySortMenuProps): React.ReactElement {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={ButtonVariant.SECONDARY} withWrapper={false}>
          <ArrowDownWideNarrow aria-hidden="true" className="size-4" />
          {PUBLIC_MEDIA_SORT_LABELS[active]}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {PUBLIC_MEDIA_SORTS.map((sort) => (
          <DropdownMenuItem asChild key={sort}>
            <Link
              aria-current={sort === active ? 'true' : undefined}
              href={communitySortHref(basePath, sort)}
            >
              {PUBLIC_MEDIA_SORT_LABELS[sort]}
              {sort === active ? (
                <Check aria-hidden="true" className="ml-auto size-4" />
              ) : null}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
