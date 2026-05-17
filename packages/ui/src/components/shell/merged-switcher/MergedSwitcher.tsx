'use client';

import { ButtonSize, ButtonVariant, GenerationType } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { AppContext } from '@genfeedai/interfaces';
import type { MergedSwitcherProps } from '@genfeedai/props/ui/merged-switcher.props';
import Link from 'next/link';
import type { ComponentType } from 'react';
import { useState } from 'react';
import {
  HiOutlineArrowPath,
  HiOutlineCalendarDays,
  HiOutlineChartBar,
  HiOutlineChatBubbleLeftRight,
  HiOutlineChevronDown,
  HiOutlineDocumentText,
  HiOutlineEnvelope,
  HiOutlineFilm,
  HiOutlineFolderOpen,
  HiOutlineMicrophone,
  HiOutlinePencilSquare,
  HiOutlinePhoto,
  HiOutlineSquares2X2,
  HiOutlineVideoCamera,
} from 'react-icons/hi2';
import { TbGridDots } from 'react-icons/tb';
import { Button } from '../../../primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../../primitives/dropdown-menu';

interface GenerationTypeConfig {
  type: GenerationType;
  icon: ComponentType<{ className?: string }>;
  label: string;
  iconClass: string;
  wrapClass: string;
}

interface NavItemConfig {
  id: AppContext;
  icon: ComponentType<{ className?: string }>;
  label: string;
  description: string;
  route: (orgSlug: string, brandSlug?: string) => string;
}

const GENERATION_TYPES: GenerationTypeConfig[] = [
  {
    type: GenerationType.POST,
    icon: HiOutlineDocumentText,
    label: 'Post',
    iconClass: 'text-indigo-400',
    wrapClass: 'bg-indigo-500/20 border-indigo-500/25',
  },
  {
    type: GenerationType.NEWSLETTER,
    icon: HiOutlineEnvelope,
    label: 'Newsletter',
    iconClass: 'text-amber-400',
    wrapClass: 'bg-amber-500/20 border-amber-500/25',
  },
  {
    type: GenerationType.VIDEO,
    icon: HiOutlineVideoCamera,
    label: 'Video',
    iconClass: 'text-red-400',
    wrapClass: 'bg-red-500/20 border-red-500/25',
  },
  {
    type: GenerationType.IMAGE,
    icon: HiOutlinePhoto,
    label: 'Image',
    iconClass: 'text-emerald-400',
    wrapClass: 'bg-emerald-500/20 border-emerald-500/25',
  },
  {
    type: GenerationType.BLOG,
    icon: HiOutlinePencilSquare,
    label: 'Blog',
    iconClass: 'text-sky-400',
    wrapClass: 'bg-sky-500/20 border-sky-500/25',
  },
  {
    type: GenerationType.PODCAST,
    icon: HiOutlineMicrophone,
    label: 'Podcast',
    iconClass: 'text-purple-400',
    wrapClass: 'bg-purple-500/20 border-purple-500/25',
  },
  {
    type: GenerationType.THREAD,
    icon: HiOutlineChatBubbleLeftRight,
    label: 'Thread',
    iconClass: 'text-orange-400',
    wrapClass: 'bg-orange-500/20 border-orange-500/25',
  },
  {
    type: GenerationType.CLIP,
    icon: HiOutlineFilm,
    label: 'Clip',
    iconClass: 'text-pink-400',
    wrapClass: 'bg-pink-500/20 border-pink-500/25',
  },
];

const NAV_ITEMS: NavItemConfig[] = [
  {
    id: 'workspace',
    icon: HiOutlineSquares2X2,
    label: 'Overview',
    description: 'Workspace & dashboard',
    route: (org, brand) =>
      brand ? `/${org}/${brand}/workspace` : `/${org}/~/overview`,
  },
  {
    id: 'workflows',
    icon: HiOutlineArrowPath,
    label: 'Workflows',
    description: 'Automations',
    route: (org, brand) =>
      brand ? `/${org}/${brand}/workflows` : `/${org}/~/overview`,
  },
  {
    id: 'library',
    icon: HiOutlineFolderOpen,
    label: 'Library',
    description: 'Ingredients & assets',
    route: (org, brand) =>
      brand ? `/${org}/${brand}/library/ingredients` : `/${org}/~/overview`,
  },
  {
    id: 'posts',
    icon: HiOutlineCalendarDays,
    label: 'Calendar',
    description: 'Posts & schedule',
    route: (org, brand) =>
      brand ? `/${org}/${brand}/posts` : `/${org}/~/overview`,
  },
  {
    id: 'analytics',
    icon: HiOutlineChartBar,
    label: 'Analytics',
    description: 'Performance metrics',
    route: (org, brand) =>
      brand
        ? `/${org}/${brand}/analytics/overview`
        : `/${org}/~/analytics/overview`,
  },
];

function withPreservedSearch(path: string, preservedSearch?: string): string {
  if (!preservedSearch) return path;

  const normalized = preservedSearch.startsWith('?')
    ? preservedSearch.slice(1)
    : preservedSearch;

  if (!normalized) return path;

  const [pathname, existing = ''] = path.split('?', 2);
  const merged = new URLSearchParams(existing);

  for (const [key, value] of new URLSearchParams(normalized).entries()) {
    merged.set(key, value);
  }

  const search = merged.toString();
  return search ? `${pathname}?${search}` : pathname;
}

export function MergedSwitcher({
  orgSlug,
  brandSlug,
  currentApp,
  currentGenerationType,
  onGenerationTypeChange,
  preservedSearch,
}: MergedSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);

  const activeGenType = GENERATION_TYPES.find(
    (g) => g.type === currentGenerationType,
  );
  const activeNavItem = NAV_ITEMS.find((n) => n.id === currentApp);

  const TriggerIcon = activeGenType?.icon ?? TbGridDots;
  const triggerLabel = activeGenType?.label ?? activeNavItem?.label ?? 'Switch';

  function handleTypeSelect(type: GenerationType) {
    onGenerationTypeChange?.(type);
    setIsOpen(false);
  }

  function getNavHref(item: NavItemConfig) {
    return withPreservedSearch(item.route(orgSlug, brandSlug), preservedSearch);
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant={ButtonVariant.GHOST}
          size={ButtonSize.SM}
          className="h-7 gap-1.5 px-2 text-[13px] font-medium"
          ariaLabel="Switch view"
        >
          <TriggerIcon
            className={cn(
              'size-3.5 shrink-0',
              activeGenType ? activeGenType.iconClass : 'text-foreground/60',
            )}
          />
          <span>{triggerLabel}</span>
          <HiOutlineChevronDown className="size-3 text-foreground/40" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        sideOffset={8}
        className="w-[360px] p-0 overflow-hidden"
      >
        {/* ── Generate ── */}
        <div className="flex items-center justify-between px-2.5 pt-2 pb-1">
          <span className="text-[9.5px] font-bold uppercase tracking-[0.07em] text-foreground/25">
            Generate
          </span>
          <Button
            type="button"
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            className="text-[10.5px] text-foreground/25 hover:text-foreground/50 transition-colors"
          >
            Manage types
          </Button>
        </div>

        <div className="grid grid-cols-4 gap-0.5 px-1.5 pb-2">
          {GENERATION_TYPES.map((gen) => {
            const Icon = gen.icon;
            const isActive = gen.type === currentGenerationType;
            return (
              <Button
                key={gen.type}
                type="button"
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
                onClick={() => handleTypeSelect(gen.type)}
                className={cn(
                  'flex flex-col items-center gap-1 py-1.5 px-1 rounded-lg cursor-pointer transition-colors',
                  'hover:bg-white/[0.07]',
                  isActive && 'bg-white/[0.09]',
                )}
              >
                <div
                  className={cn(
                    'relative flex items-center justify-center size-[26px] rounded-[6px] border',
                    gen.wrapClass,
                  )}
                >
                  <Icon className={cn('size-[13px]', gen.iconClass)} />
                  {isActive && (
                    <span className="absolute -top-[3px] -right-[3px] flex size-[11px] items-center justify-center rounded-full bg-white">
                      <svg
                        width="6"
                        height="6"
                        viewBox="0 0 12 12"
                        fill="none"
                        stroke="#111"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M2 6l3 3 5-5" />
                      </svg>
                    </span>
                  )}
                </div>
                <span
                  className={cn(
                    'text-[10px] font-medium',
                    isActive ? 'text-foreground' : 'text-foreground/55',
                  )}
                >
                  {gen.label}
                </span>
              </Button>
            );
          })}
        </div>

        <DropdownMenuSeparator />

        {/* ── Navigate ── */}
        <div className="px-2.5 pt-2 pb-1">
          <span className="text-[9.5px] font-bold uppercase tracking-[0.07em] text-foreground/25">
            Navigate
          </span>
        </div>

        <div className="grid grid-cols-2 gap-0.5 px-1.5 pb-1.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === currentApp;
            return (
              <Link
                key={item.id}
                href={getNavHref(item)}
                onClick={() => setIsOpen(false)}
                className={cn(
                  'flex items-center gap-2 px-2 py-1.5 rounded-[6px] transition-colors',
                  'hover:bg-white/[0.07]',
                  isActive && 'bg-white/[0.09]',
                )}
              >
                <span
                  className={cn(
                    'flex shrink-0 items-center justify-center size-6 rounded-[6px] border',
                    isActive
                      ? 'bg-white/[0.10] border-white/[0.14]'
                      : 'bg-white/[0.06] border-white/[0.07]',
                  )}
                >
                  <Icon
                    className={cn(
                      'size-3',
                      isActive ? 'text-foreground' : 'text-foreground/60',
                    )}
                  />
                </span>
                <span className="flex-1 min-w-0">
                  <span
                    className={cn(
                      'block text-[12px] font-medium truncate',
                      isActive ? 'text-foreground' : 'text-foreground/85',
                    )}
                  >
                    {item.label}
                  </span>
                  <span className="block text-[10.5px] text-foreground/35 truncate">
                    {item.description}
                  </span>
                </span>
                {isActive && (
                  <span className="ml-auto shrink-0 text-[9px] font-medium px-1.5 py-0.5 rounded bg-white/[0.12] border border-white/[0.07] text-foreground/80">
                    Now
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* ── Footer ── */}
        <div className="border-t border-white/[0.06] px-2.5 py-1.5">
          <Button
            type="button"
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            className="text-[10.5px] text-foreground/22 hover:text-foreground/45 transition-colors"
          >
            + Custom type
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default MergedSwitcher;
