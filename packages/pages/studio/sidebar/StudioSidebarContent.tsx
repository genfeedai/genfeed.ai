'use client';

import { IngredientCategory } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import {
  categoryToParam,
  paramToCategory,
  STUDIO_CATEGORY_CONFIG,
  useEnabledCategories,
} from '@hooks/data/organization/use-enabled-categories/use-enabled-categories';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import SidebarBackRow from '@ui/menus/sidebar-back-row/SidebarBackRow';
import SidebarSearchTrigger from '@ui/menus/sidebar-search-trigger/SidebarSearchTrigger';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import {
  HiOutlineFilm,
  HiOutlineMusicalNote,
  HiOutlinePencilSquare,
  HiOutlinePhoto,
  HiOutlineUser,
} from 'react-icons/hi2';

interface StudioSidebarContentProps {
  basePath?: string;
}

const CATEGORY_ICONS: Partial<
  Record<IngredientCategory, typeof HiOutlinePhoto>
> = {
  [IngredientCategory.AVATAR]: HiOutlineUser,
  [IngredientCategory.IMAGE]: HiOutlinePhoto,
  [IngredientCategory.MUSIC]: HiOutlineMusicalNote,
  [IngredientCategory.VIDEO]: HiOutlineFilm,
};

const CATEGORY_LABELS: Partial<Record<IngredientCategory, string>> = {
  [IngredientCategory.AVATAR]: 'Avatars',
  [IngredientCategory.IMAGE]: 'Images',
  [IngredientCategory.MUSIC]: 'Music',
  [IngredientCategory.VIDEO]: 'Videos',
};

export function StudioSidebarContent({
  basePath = '/studio',
}: StudioSidebarContentProps) {
  const pathname = usePathname();
  const params = useParams<{ type?: string }>();
  const { href } = useOrgUrl();
  const currentCategory = paramToCategory(params.type ?? null);
  const { enabledCategories, isLoading } = useEnabledCategories();

  const visibleCategories = STUDIO_CATEGORY_CONFIG.filter(
    ({ category, settingKey }) =>
      enabledCategories.includes(category) &&
      (!isLoading || settingKey === null),
  );

  const isStudioRoot = pathname === basePath;
  const isEditorRoute =
    pathname === '/editor' || pathname.startsWith('/editor/');
  const handleOpenSearch = () => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', metaKey: true }),
    );
  };

  return (
    <div className="flex h-full flex-col">
      <SidebarBackRow label="Overview" href={href('/overview')} />
      <div className="px-3 py-2">
        <SidebarSearchTrigger onClick={handleOpenSearch} />
      </div>

      <div className="space-y-0.5 px-2">
        {visibleCategories.map(({ category }) => {
          const Icon = CATEGORY_ICONS[category] ?? HiOutlinePhoto;
          const categoryPath = `${basePath}/${categoryToParam(category)}`;
          const categoryHref = href(categoryPath);
          const isActive =
            pathname === categoryPath ||
            (isStudioRoot && currentCategory === category);

          return (
            <Link
              key={category}
              href={categoryHref}
              className={cn(
                'flex items-center gap-2 rounded px-2.5 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-white/10 text-foreground'
                  : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{CATEGORY_LABELS[category] ?? category}</span>
            </Link>
          );
        })}
      </div>

      <div className="mt-4 px-3">
        <div data-testid="studio-tools-divider" className="h-px bg-white/10" />
      </div>

      <div className="space-y-0.5 px-2 pt-3">
        <Link
          href={href('/editor')}
          className={cn(
            'flex items-center gap-2 rounded px-2.5 py-2 text-sm transition-colors',
            isEditorRoute
              ? 'bg-white/10 text-foreground'
              : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground',
          )}
        >
          <HiOutlinePencilSquare className="h-4 w-4" />
          <span>Editor</span>
        </Link>
      </div>
    </div>
  );
}
