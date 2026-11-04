'use client';

import type { MultiPostSchema } from '@genfeedai/client/schemas';
import { ButtonVariant } from '@genfeedai/contracts';
import type { IPostPlatformConfig } from '@genfeedai/contracts/interfaces';
import {
  hasFormErrors,
  parseFormErrors,
} from '@genfeedai/helpers/ui/form-error/form-error.helper';
import {
  Alert,
  AlertActions,
  AlertDescription,
  AlertTitle,
} from '@ui/primitives/alert';
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
        <Alert variant="destructive">
          <div className="space-y-1">
            {parseFormErrors(formErrors).map((error) => (
              <div key={error}>{error}</div>
            ))}
          </div>
        </Alert>
      )}

      {invalidCredentialConfigs.length > 0 && (
        <Alert variant="warning">
          <AlertTitle>Some accounts need to be reconnected.</AlertTitle>
          <AlertDescription>
            {invalidCredentialSummary
              ? `Reconnect ${invalidCredentialSummary} to publish on those platforms.`
              : 'Reconnect your social accounts to enable publishing.'}
          </AlertDescription>
          <AlertActions>
            <Button
              label="Manage Connections"
              variant={ButtonVariant.SECONDARY}
              onClick={onManageConnections}
            />
          </AlertActions>
        </Alert>
      )}
    </>
  );
}
