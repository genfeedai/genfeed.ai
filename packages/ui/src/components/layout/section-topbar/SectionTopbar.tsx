'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { SectionTopbarProps } from '@genfeedai/props/ui/layout/section-topbar.props';

/**
 * SectionTopbar — the shared sub-topbar for app section pages.
 *
 * Encodes the Studio section header contract (see
 * packages/pages/studio/generate/components/AssetControlsHeader.tsx) as a
 * reusable primitive: a full-bleed bar whose bottom border touches the shell
 * edges, with title, optional subtitle, right-aligned actions, and an
 * optional tab strip that lives inside the same bordered bar. Render it as
 * the first child of a section page, above any padded content container.
 */
export default function SectionTopbar({
  title,
  subtitle,
  icon: Icon,
  actions,
  tabs,
  className,
}: SectionTopbarProps) {
  return (
    <div
      data-testid="section-topbar"
      className={cn('w-full border-b border-border', className)}
    >
      <div className="flex w-full items-center justify-between gap-3 px-6 py-2">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <div className="flex items-center gap-2">
            {Icon ? (
              <Icon className="size-4 flex-shrink-0 text-foreground/60" />
            ) : null}
            <h1 className="whitespace-nowrap text-sm font-semibold tracking-tight">
              {title}
            </h1>
          </div>
          {subtitle ? (
            <p className="hidden min-w-0 truncate text-xs text-foreground/55 lg:block">
              {subtitle}
            </p>
          ) : null}
        </div>

        {actions ? (
          <div
            data-testid="section-topbar-actions"
            className="flex flex-wrap items-center justify-end gap-2"
          >
            {actions}
          </div>
        ) : null}
      </div>

      {tabs ? (
        <div
          data-testid="section-topbar-tabs"
          className="overflow-x-auto px-4 pb-1.5 scrollbar-thin"
        >
          {tabs}
        </div>
      ) : null}
    </div>
  );
}
