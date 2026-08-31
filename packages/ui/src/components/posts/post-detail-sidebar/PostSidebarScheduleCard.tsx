'use client';

import { ButtonVariant } from '@genfeedai/enums';
import Card from '@ui/card/Card';
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

type PostSidebarScheduleCardProps = {
  scheduleDraft: string;
  isSavingSchedule: boolean;
  isScheduleDirty: boolean;
  browserTimezone: string;
  onScheduleChange: (value: string) => void;
  onScheduleSave: () => void;
  onPublishNow?: () => void;
  onPublishViaTikTokApp?: () => void;
};

export default function PostSidebarScheduleCard({
  scheduleDraft,
  isSavingSchedule,
  isScheduleDirty,
  browserTimezone,
  onScheduleChange,
  onScheduleSave,
  onPublishNow,
  onPublishViaTikTokApp,
}: PostSidebarScheduleCardProps) {
  return (
    <Card bodyClassName="space-y-3 p-4">
      <div className="space-y-0.5">
        <h3 className="text-sm font-semibold text-foreground">
          Scheduled time
        </h3>
        <p className="text-xs text-muted-foreground">
          {browserTimezone || 'Local timezone'}
        </p>
      </div>

      <FormDateTimePicker
        value={scheduleDraft}
        timezone={browserTimezone}
        onChange={(value: Date | null) =>
          onScheduleChange(value ? value.toISOString() : '')
        }
      />

      <Button
        label={isSavingSchedule ? 'Saving…' : 'Schedule'}
        variant={ButtonVariant.DEFAULT}
        className="w-full"
        withWrapper={false}
        isLoading={isSavingSchedule}
        isDisabled={!isScheduleDirty || !scheduleDraft || isSavingSchedule}
        onClick={onScheduleSave}
      />
      {onPublishNow ? (
        onPublishViaTikTokApp ? (
          <div className="space-y-2">
            <div className="flex w-full">
              <Button
                label={isSavingSchedule ? 'Publishing…' : 'Publish to TikTok'}
                variant={ButtonVariant.SECONDARY}
                className="min-w-0 flex-1 rounded-r-none"
                withWrapper={false}
                isLoading={isSavingSchedule}
                isDisabled={isSavingSchedule}
                onClick={onPublishNow}
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    ariaLabel="More TikTok publishing options"
                    label={<ChevronDown className="size-4" />}
                    variant={ButtonVariant.SECONDARY}
                    className="shrink-0 rounded-l-none border-l border-l-border px-3"
                    withWrapper={false}
                    isDisabled={isSavingSchedule}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  <DropdownMenuItem onSelect={onPublishViaTikTokApp}>
                    <div className="space-y-0.5">
                      <p className="font-medium">Publish via TikTok App</p>
                      <p className="text-muted-foreground text-xs normal-case">
                        Add TikTok-licensed music or make final edits before
                        publishing.
                      </p>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <p className="text-muted-foreground text-xs">
              By publishing, you agree to TikTok&apos;s{' '}
              <Link
                className="text-foreground underline underline-offset-2"
                href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en"
                rel="noreferrer"
                target="_blank"
              >
                Music Usage Confirmation
              </Link>
              .
            </p>
          </div>
        ) : (
          <Button
            label={isSavingSchedule ? 'Publishing…' : 'Publish now'}
            variant={ButtonVariant.SECONDARY}
            className="w-full"
            withWrapper={false}
            isLoading={isSavingSchedule}
            isDisabled={isSavingSchedule}
            onClick={onPublishNow}
          />
        )
      ) : null}
    </Card>
  );
}
