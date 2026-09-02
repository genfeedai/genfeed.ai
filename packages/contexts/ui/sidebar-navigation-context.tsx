'use client';

import type { MenuItemConfig } from '@genfeedai/contracts/interfaces/ui/menu-config.interface';
import type { WorkspaceShellBreadcrumbMetadata } from '@genfeedai/contracts/interfaces/ui/workspace-shell.interface';
import { matchesMenuSearchParams } from '@helpers/navigation/menu-route-match.helper';
import { usePathname, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { createContext, use, useCallback, useMemo, useState } from 'react';

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
  /** Canonical breadcrumb root, independent of sidebar discovery coverage. */
  breadcrumbRootLabel: string;
  /** Optional app-relative href for the root segment. */
  breadcrumbRootHref: string;
  /** Optional canonical parent between the root and current page. */
  breadcrumbParentLabel: string;
  /** Optional app-relative href for the parent segment. */
  breadcrumbParentHref: string;
  /** Canonical breadcrumb leaf, independent of sidebar discovery coverage. */
  breadcrumbPageLabel: string;
  /** Whether the permanent shell supplied canonical page identity. */
  hasCanonicalBreadcrumb: boolean;
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
 * works with flat paths and /:orgSlug/:brandSlug/ paths.
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
      'agent',
      'agents',
      'posts',
      'analytics',
      'workflows',
      'library',
      'chat',
      'discovery',
      'issues',
      'overview',
      'publishing',
      'ingredients',
      'videos',
      'edit',
      'automation',
      'elements',
      'bots',
      'lab',
      'messages',
      'tasks',
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

  // Task-context query parameters are preserved in menu hrefs but never
  // participate in route matching.
  const hrefPathname = href.split('?')[0] ?? href;

  // Strip org prefix from the pathname for matching against menu hrefs
  const normalizedPathname = stripOrgPrefix(pathname);

  if (
    hrefPathname.startsWith('/elements/') &&
    normalizedPathname.startsWith('/elements/')
  ) {
    return true;
  }
  if (
    hrefPathname.startsWith('/ingredients/') &&
    normalizedPathname.startsWith('/ingredients/')
  ) {
    return true;
  }

  return (
    normalizedPathname === hrefPathname ||
    normalizedPathname.startsWith(`${hrefPathname}/`)
  );
}

interface SidebarNavigationProviderProps {
  breadcrumb?: WorkspaceShellBreadcrumbMetadata;
  children: ReactNode;
  /** The surrounding shell permanently owns visible page identity. */
  hasCanonicalPageIdentity?: boolean;
  items: MenuItemConfig[];
}

interface NestedGroupOverride {
  activeGroupId: string;
  nestedGroupId: string | null;
}

export function SidebarNavigationProvider({
  breadcrumb,
  children,
  hasCanonicalPageIdentity = false,
  items,
}: SidebarNavigationProviderProps) {
  const pathname = usePathname();
  const rawSearchParams = useSearchParams();
  const searchParamsString = rawSearchParams?.toString() ?? '';
  const searchParams = useMemo(
    () => new URLSearchParams(searchParamsString),
    [searchParamsString],
  );

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
    const normalizedPathname = stripOrgPrefix(pathname ?? '');
    let bestMatch:
      | {
          derivedGroupId: string;
          derivedPageLabel: string;
          querySpecificity: number;
          specificity: number;
        }
      | undefined;

    for (const g of groups) {
      for (const item of g.items) {
        if (!item.href) {
          continue;
        }
        // Respect isExactMatch so a root item (e.g. General at `/settings`)
        // doesn't greedily prefix-match every subpage (`/settings/members`).
        const candidatePaths = [item.href, ...(item.matchPaths ?? [])];
        for (const candidatePath of candidatePaths) {
          const candidatePathname =
            candidatePath.split('?')[0] ?? candidatePath;
          const matches = item.isExactMatch
            ? normalizedPathname === candidatePathname
            : isPathActive(candidatePath, pathname);
          const queryMatches = matchesMenuSearchParams(
            searchParams,
            item.matchSearchParams,
          );
          const querySpecificity = item.matchSearchParams
            ? Object.keys(item.matchSearchParams).length
            : 0;

          if (
            matches &&
            queryMatches &&
            (!bestMatch ||
              candidatePathname.length > bestMatch.specificity ||
              (candidatePathname.length === bestMatch.specificity &&
                querySpecificity > bestMatch.querySpecificity))
          ) {
            bestMatch = {
              derivedGroupId: g.group,
              derivedPageLabel: item.label,
              querySpecificity,
              specificity: candidatePathname.length,
            };
          }
        }
      }
    }

    if (bestMatch) {
      return bestMatch;
    }

    return {
      derivedGroupId: groups[0]?.group ?? '',
      derivedPageLabel: '',
    };
  }, [groups, pathname, searchParams]);

  const autoNestedGroupId = useMemo(() => {
    const activeGroup = groups.find((g) => g.group === derivedGroupId);
    return activeGroup?.items[0]?.drillDown ? derivedGroupId : null;
  }, [derivedGroupId, groups]);

  const [nestedGroupOverride, setNestedGroupOverride] =
    useState<NestedGroupOverride | null>(null);

  const nestedGroupId =
    nestedGroupOverride?.activeGroupId === derivedGroupId
      ? nestedGroupOverride.nestedGroupId
      : autoNestedGroupId;

  const enterNestedGroup = useCallback(
    (groupId: string) => {
      setNestedGroupOverride({
        activeGroupId: derivedGroupId,
        nestedGroupId: groupId,
      });
    },
    [derivedGroupId],
  );

  const exitNestedGroup = useCallback(() => {
    setNestedGroupOverride({
      activeGroupId: derivedGroupId,
      nestedGroupId: null,
    });
  }, [derivedGroupId]);

  const value = useMemo<SidebarNavigationContextType>(
    () => ({
      activeGroupId: derivedGroupId,
      activePageLabel: derivedPageLabel,
      breadcrumbPageLabel: breadcrumb?.leafLabel ?? derivedPageLabel,
      breadcrumbParentHref: breadcrumb?.parentHref ?? '',
      breadcrumbParentLabel: breadcrumb?.parentLabel ?? '',
      breadcrumbRootHref: breadcrumb?.rootHref ?? '',
      breadcrumbRootLabel: breadcrumb?.rootLabel ?? derivedGroupId,
      enterNestedGroup,
      exitNestedGroup,
      groups,
      hasCanonicalBreadcrumb: hasCanonicalPageIdentity || Boolean(breadcrumb),
      nestedGroupId,
    }),
    [
      derivedGroupId,
      nestedGroupId,
      derivedPageLabel,
      breadcrumb,
      hasCanonicalPageIdentity,
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
  breadcrumbPageLabel: '',
  breadcrumbParentHref: '',
  breadcrumbParentLabel: '',
  breadcrumbRootHref: '',
  breadcrumbRootLabel: '',
  enterNestedGroup: () => {},
  exitNestedGroup: () => {},
  groups: [],
  hasCanonicalBreadcrumb: false,
  nestedGroupId: null,
};

export function useSidebarNavigation(): SidebarNavigationContextType {
  return use(SidebarNavigationContext) ?? DEFAULT_CONTEXT;
}
