'use client';

import { useBackgroundTaskContext } from '@contexts/ui/background-task-context';
import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useOverviewBootstrap } from '@hooks/data/overview/use-overview-bootstrap';
import Badge from '@ui/display/badge/Badge';
import {
  buttonVariants,
  Button as PrimitiveButton,
} from '@ui/primitives/button';
import {
  Popover,
  PopoverPanelContent,
  PopoverTrigger,
} from '@ui/primitives/popover';
import Link from 'next/link';
import { useState } from 'react';
import {
  HiArrowTopRightOnSquare,
  HiBell,
  HiCheckCircle,
  HiExclamationTriangle,
  HiOutlineArrowPath,
  HiOutlineClipboardDocumentCheck,
  HiOutlineInboxStack,
} from 'react-icons/hi2';

function getInboxItemBadge(
  item: ReturnType<
    typeof useOverviewBootstrap
  >['reviewInbox']['recentItems'][number],
): {
  label: string;
  variant: 'error' | 'primary' | 'success';
} {
  if (item.reviewDecision === 'request_changes') {
    return { label: 'Changes requested', variant: 'primary' };
  }

  if (item.reviewDecision === 'rejected' || item.status === 'failed') {
    return { label: 'Failure', variant: 'error' };
  }

  if (item.reviewDecision === 'approved') {
    return { label: 'Approved', variant: 'success' };
  }

  return { label: 'Needs review', variant: 'primary' };
}

export default function TopbarInbox() {
  const [isOpen, setIsOpen] = useState(false);
  const { reviewInbox, isLoading, refresh } = useOverviewBootstrap();
  const { tasks } = useBackgroundTaskContext();

  const actionableCount =
    reviewInbox.pendingCount +
    reviewInbox.readyCount +
    reviewInbox.changesRequestedCount +
    reviewInbox.rejectedCount;
  const activeTaskCount = tasks.filter(
    (task) => task.status === 'pending' || task.status === 'processing',
  ).length;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <PrimitiveButton
          aria-label={
            actionableCount > 0
              ? `Inbox, ${actionableCount} actionable items`
              : 'Inbox'
          }
          className={cn(
            buttonVariants({
              size: ButtonSize.SM,
              variant: ButtonVariant.GHOST,
            }),
            'inline-flex h-9 min-h-0 items-center gap-2 px-3 py-2 text-foreground/70 transition-colors duration-150 hover:bg-background/60 hover:text-foreground/90',
          )}
          data-testid="topbar-inbox-trigger"
          type="button"
        >
          <HiBell aria-hidden="true" className="h-4 w-4 text-current" />
          <span className="text-sm font-medium text-current">Inbox</span>

          {actionableCount > 0 ? (
            <Badge
              variant="error"
              size={ComponentSize.SM}
              className="min-w-5 px-1.5 text-[11px]"
            >
              {actionableCount}
            </Badge>
          ) : null}
        </PrimitiveButton>
      </PopoverTrigger>

      <PopoverPanelContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Inbox</p>
            <p className="text-xs text-foreground/50">
              Approvals, failures, requested changes, and ready output.
            </p>
          </div>
          <PrimitiveButton
            aria-label="Refresh inbox"
            className={cn(
              buttonVariants({
                size: ButtonSize.ICON,
                variant: ButtonVariant.GHOST,
              }),
              'h-8 w-8 text-foreground/60 hover:text-foreground/90',
            )}
            onClick={() => void refresh()}
            type="button"
          >
            <HiOutlineArrowPath className="h-4 w-4" />
          </PrimitiveButton>
        </div>

        <div className="grid grid-cols-2 gap-px bg-white/[0.06]">
          <div className="bg-background px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-foreground/35">
              Waiting
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-foreground">
              {reviewInbox.pendingCount}
            </p>
          </div>
          <div className="bg-background px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-foreground/35">
              Ready
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-foreground">
              {reviewInbox.readyCount}
            </p>
          </div>
          <div className="bg-background px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-foreground/35">
              Changes
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-foreground">
              {reviewInbox.changesRequestedCount}
            </p>
          </div>
          <div className="bg-background px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-foreground/35">
              Failures
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-foreground">
              {reviewInbox.rejectedCount}
            </p>
          </div>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {reviewInbox.recentItems.length > 0 ? (
            <div className="divide-y divide-white/[0.06] px-3 py-2">
              {reviewInbox.recentItems.map((item) => {
                const badge = getInboxItemBadge(item);

                return (
                  <div
                    key={item.id}
                    className="space-y-2 px-1 py-3"
                    data-testid="topbar-inbox-item"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">
                          {item.summary}
                        </p>
                        <p className="text-xs text-foreground/50">
                          {item.format}
                          {item.platform ? ` on ${item.platform}` : ''}
                        </p>
                      </div>
                      <Badge size={ComponentSize.SM} variant={badge.variant}>
                        {badge.label}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-foreground/45">
                      {item.reviewDecision === 'approved' ? (
                        <HiCheckCircle className="h-4 w-4 text-emerald-300" />
                      ) : item.reviewDecision === 'request_changes' ? (
                        <HiOutlineClipboardDocumentCheck className="h-4 w-4 text-amber-300" />
                      ) : item.reviewDecision === 'rejected' ||
                        item.status === 'failed' ? (
                        <HiExclamationTriangle className="h-4 w-4 text-rose-300" />
                      ) : (
                        <HiOutlineInboxStack className="h-4 w-4 text-foreground/35" />
                      )}
                      <span>{new Date(item.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="px-4 py-6 text-sm text-foreground/55">
              {isLoading
                ? 'Loading inbox...'
                : 'No actionable inbox items right now.'}
            </div>
          )}
        </div>

        <div className="space-y-2 border-t border-white/[0.08] p-3">
          {activeTaskCount > 0 ? (
            <div className="border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-foreground/55">
              {activeTaskCount} task{activeTaskCount === 1 ? '' : 's'} still
              processing. Track passive execution updates in Activity.
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <Link
              href="/workspace/inbox/unread"
              onClick={() => setIsOpen(false)}
              className="inline-flex h-9 items-center justify-center bg-white px-3 py-2 text-sm font-semibold text-black transition-colors duration-150 hover:bg-white/90"
            >
              Open Inbox
            </Link>
            <Link
              href="/workspace/activity"
              onClick={() => setIsOpen(false)}
              className="inline-flex h-9 items-center justify-center gap-2 border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm font-semibold text-foreground transition-colors duration-150 hover:bg-white/[0.06]"
            >
              View Activity
              <HiArrowTopRightOnSquare className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </PopoverPanelContent>
    </Popover>
  );
}
