'use client';

import type { MultiPostSchema } from '@genfeedai/client/schemas';
import {
  hasFormErrors,
  parseFormErrors,
} from '@genfeedai/helpers/ui/form-error/form-error.helper';
import { Alert } from '@ui/primitives/alert';
import type { FieldErrors } from 'react-hook-form';

type ModalPostBatchFormAlertsProps = {
  formErrors: FieldErrors<MultiPostSchema>;
};

/**
 * Validation errors above the schedule form. An expired connection is not an
 * alert here: its channel row says so and offers Reconnect in place.
 */
export default function ModalPostBatchFormAlerts({
  formErrors,
}: ModalPostBatchFormAlertsProps) {
  if (!hasFormErrors(formErrors)) {
    return null;
  }

  return (
    <Alert variant="destructive">
      <div className="space-y-1">
        {parseFormErrors(formErrors).map((error) => (
          <div key={error}>{error}</div>
        ))}
      </div>
    </Alert>
  );
}
