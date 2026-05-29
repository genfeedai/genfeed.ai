'use client';

import { ButtonVariant, type IngredientCategory } from '@genfeedai/enums';
import type { ModalPostProps } from '@genfeedai/props/modals/modal.props';
import { Button } from '@ui/primitives/button';
import { getCredentialErrorMessage } from './batch-post.utils';

type ModalPostBatchEmptyStateProps = {
  ingredient: ModalPostProps['ingredient'];
  credentials: ModalPostProps['credentials'];
  hasAvailableCredentials: boolean;
  hasInvalidCredentials: boolean;
  onClose: () => void;
  onOpenCredentials: () => void;
};

export default function ModalPostBatchEmptyState({
  ingredient,
  credentials,
  hasAvailableCredentials,
  hasInvalidCredentials,
  onClose,
  onOpenCredentials,
}: ModalPostBatchEmptyStateProps) {
  if (!ingredient) {
    return (
      <div className="text-center py-8 px-4">
        <h3 className="text-lg font-semibold mb-4">No Content Selected</h3>
        <p className="text-foreground/70 mb-6">
          Please select content to publish.
        </p>

        <Button
          label="Close"
          variant={ButtonVariant.SECONDARY}
          onClick={onClose}
        />
      </div>
    );
  }

  if (credentials?.length === 0 || !hasAvailableCredentials) {
    const title = hasInvalidCredentials
      ? 'Reconnect Accounts'
      : 'No Credentials Available';
    const errorMessage =
      credentials?.length === 0
        ? 'Please connect your social media accounts first to publish content.'
        : hasInvalidCredentials
          ? 'Your connected accounts need to be reconnected before publishing.'
          : getCredentialErrorMessage(
              ingredient.category as IngredientCategory,
            );
    const actionLabel = hasInvalidCredentials
      ? 'Reconnect Account'
      : 'Connect Account';

    return (
      <div className="text-center py-8 px-4">
        <h3 className="text-lg font-semibold mb-4">{title}</h3>
        <p className="text-foreground/70 mb-6">{errorMessage}</p>

        <div className="flex gap-3 justify-center">
          <Button
            label="Close"
            variant={ButtonVariant.SECONDARY}
            onClick={onClose}
          />

          <Button
            label={actionLabel}
            variant={ButtonVariant.DEFAULT}
            onClick={() => {
              onClose();
              onOpenCredentials();
            }}
          />
        </div>
      </div>
    );
  }

  return null;
}
