'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { WorkflowLifecycle } from '@genfeedai/workflows/contracts';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import SectionTopbar from '@ui/layout/section-topbar/SectionTopbar';
import { Button } from '@ui/primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import {
  Archive,
  ArrowLeft,
  CalendarClock,
  Ellipsis,
  Play,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { getLifecycleBadgeClass } from '@/features/workflows/utils/status-helpers';

interface WorkflowEditorSectionTopbarProps {
  estimateLabel?: string | null;
  isRunning: boolean;
  lifecycle: WorkflowLifecycle;
  onArchive: () => void;
  onPublish: () => void;
  onRun: () => void;
  onSchedule?: () => void;
  title: string;
}

export function WorkflowEditorSectionTopbar({
  estimateLabel,
  isRunning,
  lifecycle,
  onArchive,
  onPublish,
  onRun,
  onSchedule,
  title,
}: WorkflowEditorSectionTopbarProps) {
  const translate = useTranslations('common.automation.workflows.actions');
  const translateLibrary = useTranslations(
    'common.automation.workflows.library',
  );
  const { href } = useOrgUrl();
  const canArchive = lifecycle !== 'archived';
  const canPublish = lifecycle === 'draft';
  const publishUnavailableMessage =
    lifecycle === 'published'
      ? translate('publishAlreadyPublished')
      : lifecycle === 'archived'
        ? translate('publishArchived')
        : null;

  return (
    <SectionTopbar
      className="shrink-0"
      title={title}
      titleVisibility="sr-only"
      tabs={
        <nav
          aria-label="Workflow editor navigation"
          className="flex min-w-max items-center"
        >
          <Button
            asChild
            size={ButtonSize.SM}
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          >
            <Link href={href(APP_ROUTES.AUTOMATION.WORKFLOWS)}>
              <ArrowLeft className="size-4" aria-hidden="true" />
              {translateLibrary('title')}
            </Link>
          </Button>
        </nav>
      }
      actions={
        <div
          className="flex min-w-0 flex-nowrap items-center gap-2"
          data-testid="workflow-editor-section-actions"
        >
          {estimateLabel ? (
            <span className="hidden whitespace-nowrap rounded-full border border-border/80 bg-secondary/35 px-2.5 py-1 text-2xs text-muted-foreground 2xl:inline-flex">
              {estimateLabel}
            </span>
          ) : null}

          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium capitalize ${getLifecycleBadgeClass(lifecycle)}`}
          >
            {lifecycle}
          </span>

          {onSchedule ? (
            <Button
              ariaLabel={translate('schedule')}
              className="shrink-0"
              icon={<CalendarClock className="size-4" />}
              onClick={onSchedule}
              size={ButtonSize.SM}
              tooltip={translate('scheduleTooltip')}
              variant={ButtonVariant.SECONDARY}
              withWrapper={false}
            >
              <span className="hidden xl:inline">{translate('schedule')}</span>
            </Button>
          ) : null}

          <Button
            className="shrink-0"
            disabled={isRunning}
            icon={<Play className="size-4" />}
            onClick={onRun}
            size={ButtonSize.SM}
            variant={ButtonVariant.DEFAULT}
            withWrapper={false}
          >
            {isRunning ? translate('running') : translate('run')}
          </Button>

          <Button
            aria-describedby={
              publishUnavailableMessage
                ? 'workflow-publish-unavailable-description'
                : undefined
            }
            className="shrink-0"
            disabled={!canPublish}
            onClick={onPublish}
            size={ButtonSize.SM}
            tooltip={publishUnavailableMessage ?? undefined}
            variant={ButtonVariant.SECONDARY}
            withWrapper={false}
          >
            {translate('publish')}
          </Button>
          {publishUnavailableMessage ? (
            <span
              className="sr-only"
              id="workflow-publish-unavailable-description"
            >
              {publishUnavailableMessage}
            </span>
          ) : null}

          {canArchive ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  ariaLabel={translate('menu')}
                  className="shrink-0"
                  icon={<Ellipsis className="size-4" />}
                  size={ButtonSize.ICON}
                  tooltip={translate('menu')}
                  variant={ButtonVariant.GHOST}
                  withWrapper={false}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={onArchive}
                >
                  <Archive className="size-4" aria-hidden="true" />
                  {translate('archive')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      }
    />
  );
}
