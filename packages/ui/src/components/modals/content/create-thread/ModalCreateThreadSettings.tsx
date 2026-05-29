'use client';

import { getPostStatusOptions } from '@genfeedai/helpers/content/posts.helper';
import type { ModalCreateThreadSettingsProps } from '@genfeedai/props/modals/modal.props';
import FormDateTimePicker from '@ui/primitives/date-time-picker';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { SelectField } from '@ui/primitives/select';

export default function ModalCreateThreadSettings({
  form,
  credentials,
  credentialOptions,
  browserTimezone,
}: ModalCreateThreadSettingsProps) {
  return (
    <div className="border border-white/[0.08] p-4 space-y-4">
      <h3 className="font-semibold">Thread Settings</h3>

      {credentials.length > 0 && (
        <FormControl
          label="Platform Account"
          error={form.formState.errors.credential?.message}
        >
          <SelectField
            name="credential"
            control={form.control}
            placeholder="Select platform account"
          >
            {credentialOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
        </FormControl>
      )}

      <FormControl label="Thread Title (Optional)">
        <Input
          name="globalTitle"
          control={form.control}
          placeholder="Optional title for all posts in thread"
        />
      </FormControl>

      <div className="grid grid-cols-2 gap-4">
        <FormControl
          label="Scheduled Date"
          error={form.formState.errors.scheduledDate?.message}
        >
          <FormDateTimePicker
            value={form.watch('scheduledDate')}
            timezone={browserTimezone}
            onChange={(value) =>
              form.setValue('scheduledDate', value ? value.toISOString() : '')
            }
          />
        </FormControl>

        <FormControl
          label="Status"
          error={form.formState.errors.status?.message}
        >
          <SelectField name="status" control={form.control}>
            {getPostStatusOptions().map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
        </FormControl>
      </div>
    </div>
  );
}
