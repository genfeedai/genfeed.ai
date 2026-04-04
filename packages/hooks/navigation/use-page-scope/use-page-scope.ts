import { useParams, usePathname } from 'next/navigation';

export type PageScope = 'org' | 'brand';

export function usePageScope(): PageScope {
  const params = useParams<{ brandSlug?: string }>();
  const pathname = usePathname();

  if (pathname.includes('/~/') && !params.brandSlug) {
    return 'org';
  }

  return 'brand';
}
