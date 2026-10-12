'use client';

import { ButtonVariant, CredentialPlatform } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { PostSidebarWhenDockProps } from '@genfeedai/props/components/post-detail-sidebar.props';
import ClientDateTime from '@ui/components/time/ClientDateTime';
import Tabs from '@ui/navigation/tabs/Tabs';
import { Button } from '@ui/primitives/button';
import FormDateTimePicker from '@ui/primitives/date-time-picker';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@ui/primitives/dropdown-menu';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { getPlatformLabel } from './PostSidebarDestination';

type PublishMode = 'now' | 'schedule';

const DOCK_CLASS_NAME =
  'sticky bottom-0 z-10 flex flex-col gap-3 border-t border-border bg-background py-3';

/**
 * The pinned "When" dock at the bottom of the inspector. Publishing lives here:
 * Now publishes immediately, Schedule reveals the date picker. Published posts
 * show their publish time and a link to the live post instead.
 */
export default function PostSidebarWhenDock({
  post,
  scheduleDraft,
  isSavingSchedule,
  isScheduleDirty,
  isPublished,
  browserTimezone,
  isTikTokReady = true,
  onScheduleChange,
  onScheduleSave,
  onPublishNow,
  onPublishViaTikTokApp,
}: PostSidebarWhenDockProps) {
  const translate = useTranslations('agent.postSidebarSchedule');
  const [mode, setMode] = useState<PublishMode>(
    scheduleDraft || !onPublishNow ? 'schedule' : 'now',
  );

  if (isPublished) {
    return (
      <div className={DOCK_CLASS_NAME} data-testid="post-when-dock">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">{translate('published')}</h3>
          {post.publicationDate ? (
            <p className="text-xs text-muted-foreground">
              <ClientDateTime
                value={post.publicationDate}
                format={(date) =>
                  date.toLocaleString(undefined, {
                    timeZone: browserTimezone,
                  })
                }
              />
            </p>
          ) : null}
        </div>
        {post.url ? (
          <Button
            asChild
            variant={ButtonVariant.SECONDARY}
            withWrapper={false}
            className="w-full"
          >
            <Link href={post.url} target="_blank" rel="noopener noreferrer">
              {translate('viewOn', {
                platform: getPlatformLabel(post.platform),
              })}
            </Link>
          </Button>
        ) : null}
      </div>
    );
  }

  const activeMode: PublishMode = onPublishNow ? mode : 'schedule';
  const isTikTok = post.platform === CredentialPlatform.TIKTOK;
  const isTikTokBlocked = isTikTok && !isTikTokReady;
  const missingLabel = isTikTokBlocked
    ? translate('finishTikTokSettings')
    : activeMode === 'schedule' && !scheduleDraft
      ? translate('chooseDateTime')
      : undefined;
  const isBlocked = isSavingSchedule || isTikTokBlocked;

  return (
    <div className={DOCK_CLASS_NAME} data-testid="post-when-dock">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{translate('when')}</h3>
        <p
          className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
          data-testid="post-when-readiness"
        >
          <span
            aria-hidden="true"
            className={cn(
              'gen-dot',
              missingLabel ? 'gen-dot-warning' : 'gen-dot-success',
            )}
          />
          <span className="truncate">{missingLabel ?? translate('ready')}</span>
        </p>
      </div>

      {onPublishNow ? (
        <Tabs
          ariaLabel={translate('publishTiming')}
          items={[
            { id: 'now', label: translate('now') },
            { id: 'schedule', label: translate('schedule') },
          ]}
          activeTab={activeMode}
          onTabChange={(tabId) => setMode(tabId as PublishMode)}
          fullWidth={false}
          className="justify-start"
          listClassName="ml-0"
        />
      ) : null}

      {activeMode === 'schedule' ? (
        <div className="flex flex-col gap-2">
          <FormDateTimePicker
            value={scheduleDraft}
            timezone={browserTimezone}
            onChange={(value: Date | null) =>
              onScheduleChange(value ? value.toISOString() : '')
            }
          />
          <p className="text-xs text-muted-foreground">
            {translate('scheduledTime')} · {browserTimezone || 'Local timezone'}
          </p>
        </div>
      ) : null}

      {activeMode === 'schedule' ? (
        <Button
          label={isSavingSchedule ? translate('saving') : translate('schedule')}
          variant={ButtonVariant.DEFAULT}
          className="w-full"
          withWrapper={false}
          isLoading={isSavingSchedule}
          isDisabled={!isScheduleDirty || !scheduleDraft || isBlocked}
          onClick={onScheduleSave}
        />
      ) : onPublishViaTikTokApp ? (
        <div className="flex flex-col gap-2">
          <div className="flex w-full">
            <Button
              label={
                isSavingSchedule
                  ? translate('publishing')
                  : translate('publishToTikTok')
              }
              variant={ButtonVariant.DEFAULT}
              className="min-w-0 flex-1 rounded-r-none"
              withWrapper={false}
              isLoading={isSavingSchedule}
              isDisabled={isBlocked}
              onClick={onPublishNow}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  ariaLabel={translate('moreTikTokOptions')}
                  label={<ChevronDown className="size-4" />}
                  variant={ButtonVariant.DEFAULT}
                  className="shrink-0 rounded-l-none border-l border-l-border px-3"
                  withWrapper={false}
                  isDisabled={isBlocked}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuItem onSelect={onPublishViaTikTokApp}>
                  <div className="space-y-0.5">
                    <p className="font-medium">
                      {translate('publishViaTikTokApp')}
                    </p>
                    <p className="text-muted-foreground text-xs normal-case">
                      {translate('publishViaTikTokAppDescription')}
                    </p>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <p className="text-muted-foreground text-xs">
            {translate('musicConfirmationPrefix')}{' '}
            <Link
              className="text-foreground underline underline-offset-2"
              href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en"
              rel="noreferrer"
              target="_blank"
            >
              {translate('musicConfirmation')}
            </Link>
            .
          </p>
        </div>
      ) : (
        <Button
          label={
            isSavingSchedule ? translate('publishing') : translate('publishNow')
          }
          variant={ButtonVariant.DEFAULT}
          className="w-full"
          withWrapper={false}
          isLoading={isSavingSchedule}
          isDisabled={isBlocked}
          onClick={onPublishNow}
        />
      )}
    </div>
  );
}
