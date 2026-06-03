'use client';

import { useSidebarNavigation } from '@genfeedai/contexts/ui/sidebar-navigation-context';
import type { ContainerTitleProps } from '@genfeedai/props/layout/container-title.props';
import CardIcon from '@ui/card/icon/CardIcon';

export default function ContainerTitle({
  title,
  description,
  icon,
}: ContainerTitleProps) {
  const { activeGroupId, activePageLabel } = useSidebarNavigation();
  const hasBreadcrumb = Boolean(activeGroupId || activePageLabel);

  const isTextDescription =
    typeof description === 'number' || typeof description === 'string';
  const DescriptionTag = isTextDescription ? 'p' : 'div';

  const titleContent = (
    <>
      <h1 className="text-base font-semibold tracking-[-0.01em] text-foreground">
        {title}
      </h1>
      {hasBreadcrumb ? (
        <nav
          aria-label="Breadcrumb"
          className="mt-1 flex items-center gap-1.5 text-xs text-foreground/45"
        >
          {activeGroupId ? (
            <span className="truncate">{activeGroupId}</span>
          ) : null}
          {activeGroupId && activePageLabel ? (
            <span aria-hidden="true" className="select-none text-foreground/25">
              ›
            </span>
          ) : null}
          {activePageLabel ? (
            <span className="truncate text-foreground/65">
              {activePageLabel}
            </span>
          ) : null}
        </nav>
      ) : null}
      {description ? (
        <DescriptionTag className="mt-1 max-w-3xl text-xs leading-snug text-foreground/55">
          {description}
        </DescriptionTag>
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
