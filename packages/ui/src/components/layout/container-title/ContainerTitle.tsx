'use client';

import { useSidebarNavigation } from '@genfeedai/contexts/ui/sidebar-navigation-context';
import type { ContainerTitleProps } from '@genfeedai/props/layout/container-title.props';
import CardIcon from '@ui/card/icon/CardIcon';

export default function ContainerTitle({
  title,
  icon,
  titleVisibility = 'visible',
}: ContainerTitleProps) {
  const { activeGroupId, activePageLabel, hasCanonicalBreadcrumb } =
    useSidebarNavigation();
  if (titleVisibility === 'sr-only' || hasCanonicalBreadcrumb) {
    return <h1 className="sr-only">{title}</h1>;
  }

  const normalizedTitle =
    typeof title === 'string' ? title.trim().toLowerCase() : null;
  const normalizedPageLabel = activePageLabel?.trim().toLowerCase() ?? null;
  const isDuplicatePageLabel =
    !activeGroupId &&
    normalizedTitle !== null &&
    normalizedPageLabel !== null &&
    normalizedTitle === normalizedPageLabel;
  const hasBreadcrumb = Boolean(
    activeGroupId || (activePageLabel && !isDuplicatePageLabel),
  );

  const titleContent = (
    <>
      <h1 className="text-base font-semibold tracking-[-0.01em] text-foreground">
        {title}
      </h1>
      {hasBreadcrumb ? (
        <nav
          aria-label="Breadcrumb"
          className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          {activeGroupId ? (
            <span className="truncate">{activeGroupId}</span>
          ) : null}
          {activeGroupId && activePageLabel ? (
            <span aria-hidden="true" className="select-none text-foreground/40">
              ›
            </span>
          ) : null}
          {activePageLabel ? (
            <span className="truncate text-foreground/70">
              {activePageLabel}
            </span>
          ) : null}
        </nav>
      ) : null}
    </>
  );

  if (!icon) {
    return <div>{titleContent}</div>;
  }

  return (
    <div className="flex items-center gap-2">
      <CardIcon
        icon={icon}
        className="text-foreground/60"
        iconClassName="size-3.5"
      />
      <div className="min-w-0">{titleContent}</div>
    </div>
  );
}
