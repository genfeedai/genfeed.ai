'use client';

import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

interface GroupedMenu {
  group: string;
  items: MenuItemConfig[];
}

interface SidebarNavigationContextType {
  /** Currently active group derived from route */
  activeGroupId: string;
  /** Group currently shown in nested (drill-in) mode, null = rail+panel */
  nestedGroupId: string | null;
  /** Label of the currently active page */
  activePageLabel: string;
  /** All grouped menu items for breadcrumb/navigation reference */
  groups: GroupedMenu[];
  /** Enter nested sidebar mode for a group */
  enterNestedGroup: (groupId: string) => void;
  /** Exit nested mode back to rail+panel */
  exitNestedGroup: () => void;
}

const SidebarNavigationContext = createContext<
  SidebarNavigationContextType | undefined
>(undefined);

/**
 * Strip the org/brand prefix from a pathname so route detection
 * works with both legacy flat paths and new /:orgSlug/:brandSlug/ paths.
 * URL structure: /orgSlug/brandSlug/rest or /orgSlug/~/rest
 */
function stripOrgPrefix(path: string): string {
  const parts = path.split('/').filter(Boolean);
  if (parts.length >= 2) {
    // Second segment is ~ (org-level) or a brand slug
    if (parts[1] === '~') {
      return `/${parts.slice(2).join('/')}`;
    }
    // Check if it looks like an org-scoped path (has 3+ segments and
    // the third segment matches a known app route prefix)
    const knownPrefixes = [
      'workspace',
      'studio',
      'settings',
      'agents',
      'posts',
      'analytics',
      'workflows',
      'library',
      'chat',
      'compose',
      'editor',
      'research',
      'issues',
      'overview',
      'ingredients',
      'videos',
      'edit',
      'orchestration',
      'elements',
      'bots',
    ];
    if (parts.length >= 3 && knownPrefixes.includes(parts[2])) {
      return `/${parts.slice(2).join('/')}`;
    }
  }
  return path;
}

function isPathActive(href: string, pathname: string | null): boolean {
  if (!href || !pathname) {
    return false;
  }

  // Strip org prefix from the pathname for matching against menu hrefs
  const normalizedPathname = stripOrgPrefix(pathname);

  if (
    href.startsWith('/elements/') &&
    normalizedPathname.startsWith('/elements/')
  ) {
    return true;
  }
  if (
    href.startsWith('/ingredients/') &&
    normalizedPathname.startsWith('/ingredients/')
  ) {
    return true;
  }

  return (
    normalizedPathname === href || normalizedPathname.startsWith(`${href}/`)
  );
}

interface SidebarNavigationProviderProps {
  children: ReactNode;
  items: MenuItemConfig[];
}

export function SidebarNavigationProvider({
  children,
  items,
}: SidebarNavigationProviderProps) {
  const pathname = usePathname();

  const groups = useMemo<GroupedMenu[]>(() => {
    const result: GroupedMenu[] = [];
    let currentGroup: string | undefined;

    items.forEach((item) => {
      const group = item.group ?? '';
      if (group !== currentGroup) {
        currentGroup = group;
        result.push({ group, items: [item] });
      } else {
        result[result.length - 1].items.push(item);
      }
    });

    return result;
  }, [items]);

  // Derive active group + page from pathname
  const { derivedGroupId, derivedPageLabel } = useMemo(() => {
    for (const g of groups) {
      for (const item of g.items) {
        if (item.href && isPathActive(item.href, pathname)) {
          return { derivedGroupId: g.group, derivedPageLabel: item.label };
        }
      }
    }
    return {
      derivedGroupId: groups[0]?.group ?? '',
      derivedPageLabel: '',
    };
  }, [groups, pathname]);

  const [nestedGroupId, setNestedGroupId] = useState<string | null>(null);

  // Auto-enter nested mode only for drill-down groups
  useEffect(() => {
    const activeGroup = groups.find((g) => g.group === derivedGroupId);
    if (activeGroup?.items[0]?.drillDown) {
      setNestedGroupId(derivedGroupId);
    } else {
      setNestedGroupId(null);
    }
  }, [derivedGroupId, groups]);

  const enterNestedGroup = useCallback((groupId: string) => {
    setNestedGroupId(groupId);
  }, []);

  const exitNestedGroup = useCallback(() => {
    setNestedGroupId(null);
  }, []);

  const value = useMemo<SidebarNavigationContextType>(
    () => ({
      activeGroupId: derivedGroupId,
      activePageLabel: derivedPageLabel,
      enterNestedGroup,
      exitNestedGroup,
      groups,
      nestedGroupId,
    }),
    [
      derivedGroupId,
      nestedGroupId,
      derivedPageLabel,
      groups,
      enterNestedGroup,
      exitNestedGroup,
    ],
  );

  return (
    <SidebarNavigationContext.Provider value={value}>
      {children}
    </SidebarNavigationContext.Provider>
  );
}

const DEFAULT_CONTEXT: SidebarNavigationContextType = {
  activeGroupId: '',
  activePageLabel: '',
  enterNestedGroup: () => {},
  exitNestedGroup: () => {},
  groups: [],
  nestedGroupId: null,
};

export function useSidebarNavigation(): SidebarNavigationContextType {
  return useContext(SidebarNavigationContext) ?? DEFAULT_CONTEXT;
}
