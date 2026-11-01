'use client';

import {
  ButtonVariant,
  CardEmptySize,
  type IngredientCategory,
} from '@genfeedai/contracts';
import type { ModalPostProps } from '@genfeedai/props/modals/modal.props';
import { Button } from '@ui/primitives/button';
import { EmptyState } from '@ui/primitives/empty-state';
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
      <EmptyState
        size={CardEmptySize.SM}
        title="No Content Selected"
        description="Please select content to publish."
        actions={
          <Button
            label="Close"
            variant={ButtonVariant.SECONDARY}
            onClick={onClose}
          />
        }
      />
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
      <EmptyState
        size={CardEmptySize.SM}
        title={title}
        description={errorMessage}
        actions={
          <>
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
          </>
        }
      />
    );
  }

  return null;
}
