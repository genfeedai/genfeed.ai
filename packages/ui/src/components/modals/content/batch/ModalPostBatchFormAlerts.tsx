'use client';

import type { MultiPostSchema } from '@genfeedai/client/schemas';
import { AlertCategory, ButtonVariant } from '@genfeedai/enums';
import {
  hasFormErrors,
  parseFormErrors,
} from '@genfeedai/helpers/ui/form-error/form-error.helper';
import type { IPostPlatformConfig } from '@genfeedai/interfaces';
import Alert from '@ui/feedback/alert/Alert';
import { Button } from '@ui/primitives/button';
import type { FieldErrors } from 'react-hook-form';

type ModalPostBatchFormAlertsProps = {
  formErrors: FieldErrors<MultiPostSchema>;
  invalidCredentialConfigs: IPostPlatformConfig[];
  invalidCredentialSummary: string;
  onManageConnections: () => void;
};

export default function ModalPostBatchFormAlerts({
  formErrors,
  invalidCredentialConfigs,
  invalidCredentialSummary,
  onManageConnections,
}: ModalPostBatchFormAlertsProps) {
  return (
    <>
      {hasFormErrors(formErrors) && (
        <Alert type={AlertCategory.ERROR} className="mb-4">
          <div className="space-y-1">
            {parseFormErrors(formErrors).map((error) => (
              <div key={error}>{error}</div>
            ))}
          </div>
        </Alert>
      )}

      {invalidCredentialConfigs.length > 0 && (
        <Alert type={AlertCategory.WARNING} className="mb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="font-medium">
                Some accounts need to be reconnected.
              </div>
              <div className="text-xs text-foreground/70">
                {invalidCredentialSummary
                  ? `Reconnect ${invalidCredentialSummary} to publish on those platforms.`
                  : 'Reconnect your social accounts to enable publishing.'}
              </div>
            </div>
            <Button
              label="Manage Connections"
              variant={ButtonVariant.OUTLINE}
              onClick={onManageConnections}
            />
          </div>
        </Alert>
      )}
    </>
  );
}
