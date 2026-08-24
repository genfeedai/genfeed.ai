import { usePathname } from 'next/navigation';

export type PageScope = 'org' | 'brand';

export function usePageScope(): PageScope {
  const pathname = usePathname() ?? '';

  if (pathname.includes('/~/')) {
    return 'org';
  }

  return 'brand';
}
