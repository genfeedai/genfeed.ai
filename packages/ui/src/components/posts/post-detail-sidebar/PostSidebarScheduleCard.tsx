'use client';

import { ButtonVariant } from '@genfeedai/enums';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import FormDateTimePicker from '@ui/primitives/date-time-picker';

type PostSidebarScheduleCardProps = {
  scheduleDraft: string;
  isSavingSchedule: boolean;
  isScheduleDirty: boolean;
  browserTimezone: string;
  onScheduleChange: (value: string) => void;
  onScheduleSave: () => void;
  onPublishNow?: () => void;
};

export default function PostSidebarScheduleCard({
  scheduleDraft,
  isSavingSchedule,
  isScheduleDirty,
  browserTimezone,
  onScheduleChange,
  onScheduleSave,
  onPublishNow,
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
        <Button
          label={isSavingSchedule ? 'Publishing…' : 'Publish now'}
          variant={ButtonVariant.SECONDARY}
          className="w-full"
          withWrapper={false}
          isLoading={isSavingSchedule}
          isDisabled={isSavingSchedule}
          onClick={onPublishNow}
        />
      ) : null}
    </Card>
  );
}
