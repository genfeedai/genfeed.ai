'use client';

import { useSidebarNavigation } from '@genfeedai/contexts/ui/sidebar-navigation-context';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { ContainerProps } from '@genfeedai/props/ui/ui.props';
import ContainerTitle from '@ui/layout/container-title/ContainerTitle';
import SectionTopbar from '@ui/layout/section-topbar/SectionTopbar';
import Tabs from '@ui/navigation/tabs/Tabs';
import type { ComponentType, ReactNode } from 'react';
import { useState } from 'react';

/**
 * Page body shell.
 *
 * **Module-local chrome** (sibling surfaces + primary tools) always renders
 * through {@link SectionTopbar}: full-bleed `border-b`, tabs left, actions
 * right — one app-wide pattern, not a Discovery-only flourish. Sources:
 * - explicit `headerTabs` (preferred for local nav)
 * - body `tabs` promoted when `right` actions exist
 * - body `tabs` alone (former orphan strip under the title)
 * - breadcrumb / sr-only title + `right` tools (date range, refresh, etc.)
 *
 * **Title-only / create CTA** rows (visible title, no local tab nav) stay in
 * the padded title toolbar — not a second full-bleed bar.
 *
 * Discovery Socials may still render {@link SectionTopbar} as a sibling above a
 * chrome-less Container; both compositions must look identical.
 */
export default function Container({
  label,
  description,
  icon,
  titleVisibility = 'visible',
  tabs,
  headerTabs,
  activeTab: controlledActiveTab,
  onTabChange: controlledOnTabChange,
  left,
  right,
  children,
  bodyClassName,
  fullWidth = true,
  className = '',
}: ContainerProps) {
  const [internalActiveTab, setInternalActiveTab] = useState<string>('');
  const hasLeft = Boolean(left);
  const { hasCanonicalBreadcrumb } = useSidebarNavigation();

  const activeTab = controlledActiveTab ?? internalActiveTab;
  const onTabChange = controlledOnTabChange ?? setInternalActiveTab;

  const hasHeaderRight = Boolean(right);
  const hasBodyTabs = Boolean(tabs && tabs.length > 0);
  // Prefer explicit headerTabs. Body tabs + primary actions used to render as
  // a right-only bar with an orphan strip underneath — always promote.
  const shouldPromoteBodyTabs = hasBodyTabs && hasHeaderRight && !headerTabs;
  // Body tabs alone also join the module bar (no more floating strip).
  const shouldLiftBodyTabsAlone = hasBodyTabs && !headerTabs && !hasHeaderRight;
  const resolvedHeaderTabs: ContainerProps['headerTabs'] = headerTabs
    ? headerTabs
    : shouldPromoteBodyTabs || shouldLiftBodyTabsAlone
      ? {
          activeTab,
          fullWidth: false,
          onTabChange,
          tabs,
        }
      : undefined;
  const hasHeaderTabs = Boolean(resolvedHeaderTabs);

  const isTitleChromeSuppressed =
    titleVisibility === 'sr-only' || Boolean(label && hasCanonicalBreadcrumb);
  const hasVisibleTitle = Boolean(label && !isTitleChromeSuppressed);
  // When SectionTopbar owns the chrome title, skip a second sr-only h1 here.
  const needsStandaloneScreenReaderTitle =
    Boolean(label && isTitleChromeSuppressed) &&
    !(
      hasHeaderTabs ||
      shouldPromoteBodyTabs ||
      shouldLiftBodyTabsAlone ||
      (!hasVisibleTitle && hasHeaderRight)
    );

  const insetClassName = fullWidth ? 'px-5 sm:px-6' : '';
  const bodyInsetClassName = fullWidth ? insetClassName : '';

  // One pattern: SectionTopbar for any local nav and/or chrome-only tools.
  const usesModuleLocalChrome =
    hasHeaderTabs ||
    shouldPromoteBodyTabs ||
    shouldLiftBodyTabsAlone ||
    (!hasVisibleTitle && hasHeaderRight);

  // Visible title + primary actions only (e.g. admin "Invite") — padded row.
  const usesTitleActionToolbar =
    hasVisibleTitle && hasHeaderRight && !usesModuleLocalChrome;

  const sectionTitle =
    typeof label === 'string' && label.length > 0 ? label : 'Page';
  const sectionSubtitle =
    hasVisibleTitle && typeof description === 'string'
      ? description
      : undefined;
  const sectionIcon =
    hasVisibleTitle && typeof icon === 'function'
      ? (icon as ComponentType<{ className?: string }>)
      : undefined;

  const moduleTabsNode = resolvedHeaderTabs ? (
    <Tabs
      {...resolvedHeaderTabs}
      className={cn(resolvedHeaderTabs.className, 'mb-0 w-full justify-start')}
    />
  ) : null;

  // Title suppressed by shell breadcrumb / sr-only and no module tools: only
  // body padding — do not keep a full title-row vertical budget for empty air.
  const classicPaddingClassName =
    isTitleChromeSuppressed && !usesTitleActionToolbar
      ? fullWidth
        ? 'mx-0 max-w-none pt-3 pb-5 sm:pt-4 sm:pb-6'
        : 'mx-auto max-w-[1280px] px-5 pt-3 pb-5 sm:px-6 sm:pt-4 sm:pb-6'
      : fullWidth
        ? 'mx-0 max-w-none py-5 sm:py-6'
        : 'mx-auto max-w-[1280px] px-5 py-5 sm:px-6 sm:py-6';

  return (
    <div
      data-testid="container"
      className={cn(
        'w-full',
        !usesModuleLocalChrome && classicPaddingClassName,
        usesModuleLocalChrome &&
          (fullWidth ? 'mx-0 max-w-none' : 'mx-auto max-w-[1280px]'),
        className,
      )}
      data-module-chrome={usesModuleLocalChrome ? 'section-topbar' : 'classic'}
    >
      {needsStandaloneScreenReaderTitle ? (
        <ContainerTitle title={label as ReactNode} titleVisibility="sr-only" />
      ) : null}

      {usesModuleLocalChrome ? (
        <SectionTopbar
          title={sectionTitle}
          subtitle={sectionSubtitle}
          icon={sectionIcon}
          titleVisibility={hasVisibleTitle ? 'visible' : 'sr-only'}
          actions={
            hasHeaderRight ? (
              <div
                data-testid="container-header-actions"
                className="flex shrink-0 flex-wrap items-center justify-end gap-2.5"
              >
                {right}
              </div>
            ) : undefined
          }
          tabs={moduleTabsNode ?? undefined}
        />
      ) : null}

      {usesTitleActionToolbar ? (
        <div
          className={cn(
            'mb-4 flex items-center justify-between gap-4 pb-3',
            insetClassName,
          )}
        >
          <ContainerTitle title={label} description={description} icon={icon} />
          <div
            data-testid="container-header-actions"
            className="flex shrink-0 flex-wrap items-center justify-end gap-2.5"
          >
            {right}
          </div>
        </div>
      ) : null}

      {hasVisibleTitle && !usesModuleLocalChrome && !usesTitleActionToolbar ? (
        <div className={cn('mb-4 pb-3', insetClassName)}>
          <ContainerTitle title={label} description={description} icon={icon} />
        </div>
      ) : null}

      {hasLeft ? (
        <div
          className={cn(
            'mb-4',
            usesModuleLocalChrome
              ? cn(bodyInsetClassName, 'pt-5 sm:pt-6')
              : insetClassName,
          )}
        >
          {left}
        </div>
      ) : null}

      <div
        className={cn(
          usesModuleLocalChrome
            ? cn(bodyInsetClassName, 'py-5 sm:py-6', bodyClassName)
            : cn(bodyInsetClassName, bodyClassName),
        )}
      >
        {children}
      </div>
    </div>
  );
}
