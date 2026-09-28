'use client';

import {
  fromDateTimeLocalInput,
  toDateTimeLocalInput,
} from '@helpers/formatting/timezone/timezone.helper';
import { isPastScheduleInstant } from '@pages/posts/shared/release-status.helpers';
import type { ReleaseRescheduleFieldProps } from '@props/publisher/release-calendar.props';
import { Button } from '@ui/primitives/button';
import Field from '@ui/primitives/field';
import { Form } from '@ui/primitives/form';
import { Input } from '@ui/primitives/input';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

/**
 * One send-time field with its own Reschedule button. The value is read and
 * edited in the schedule's own zone and submitted as an absolute instant.
 * Re-seeds only when the server's instant changes, so a background refetch
 * never overwrites what the operator is typing, and a rejected save leaves the
 * typed value in place to correct and retry.
 */
export default function ReleaseRescheduleField({
  buttonAriaLabel,
  buttonLabel,
  fieldLabel,
  isDisabled,
  isPending,
  isSaving,
  onReschedule,
  scheduledAt,
  timezone,
}: ReleaseRescheduleFieldProps): React.JSX.Element {
  const translate = useTranslations('pages.publishing.release.reschedule');
  const seed = toDateTimeLocalInput(scheduledAt, timezone);
  const [value, setValue] = useState(seed);
  const [submittedValue, setSubmittedValue] = useState<string | null>(null);
  const [isPastAtSubmit, setIsPastAtSubmit] = useState(false);

  useEffect(() => {
    setValue(seed);
  }, [seed]);

  const isDirty = value !== '' && value !== seed;
  const instant = value ? fromDateTimeLocalInput(value, timezone) : null;
  const isPast = isDirty && instant !== null && isPastScheduleInstant(instant);
  const isSaved =
    !isSaving && submittedValue !== null && submittedValue === seed && !isDirty;
  const errorMessage =
    isPast || isPastAtSubmit ? translate('pastError') : undefined;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (isDisabled || isPending || !isDirty || instant === null) {
      return;
    }
    if (isPastScheduleInstant(instant)) {
      setIsPastAtSubmit(true);
      return;
    }
    setSubmittedValue(value);
    onReschedule(instant);
  }

  return (
    <Form onSubmit={handleSubmit}>
      <Field
        error={errorMessage}
        helpText={translate('timezoneHint', { timezone })}
        label={fieldLabel}
      >
        <Input
          isDisabled={isDisabled || isPending}
          min={toDateTimeLocalInput(new Date(), timezone)}
          onChange={(event) => {
            setValue(event.target.value);
            setIsPastAtSubmit(false);
          }}
          type="datetime-local"
          value={value}
        />
      </Field>
      <Button
        // A release fans out to several identically-labelled controls; the
        // caller keeps each accessible name distinct and stable while the
        // spinner replaces the visible text.
        ariaLabel={buttonAriaLabel}
        className="w-full"
        isDisabled={
          isDisabled || isPending || !isDirty || instant === null || isPast
        }
        isLoading={isSaving}
        label={buttonLabel}
        type="submit"
        withWrapper={false}
      />
      {isSaved ? (
        <p className="text-sm text-muted-foreground" role="status">
          {translate('saved')}
        </p>
      ) : null}
    </Form>
  );
}
