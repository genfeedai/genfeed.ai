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
};

export default function PostSidebarScheduleCard({
  scheduleDraft,
  isSavingSchedule,
  isScheduleDirty,
  browserTimezone,
  onScheduleChange,
  onScheduleSave,
}: PostSidebarScheduleCardProps) {
  return (
    <Card>
      <div className="flex items-center gap-2 mb-2">
        <h3 className="font-semibold text-lg">Scheduled Time</h3>
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
        isLoading={isSavingSchedule}
        isDisabled={!isScheduleDirty || !scheduleDraft || isSavingSchedule}
        onClick={onScheduleSave}
      />
    </Card>
  );
}
