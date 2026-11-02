'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import type { GhostConnectDialogProps } from '@props/pages/brand-integrations.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { ServicesService } from '@services/external/services.service';
import { Alert } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import Field from '@ui/primitives/field';
import { Form } from '@ui/primitives/form';
import { Input } from '@ui/primitives/input';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';

/**
 * Ghost authenticates with a site URL and an Admin API key, not an OAuth
 * redirect. The server verifies the pair against the site before storing it.
 */
export default function GhostConnectDialog({
  brandId,
  onConnected,
  onOpenChange,
  open,
}: GhostConnectDialogProps) {
  const translate = useTranslations('pages.brandSocialMedia');
  const { getToken } = useAuthIdentity();
  const [ghostUrl, setGhostUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasError, setHasError] = useState(false);

  const canSubmit = ghostUrl.trim() !== '' && apiKey.trim() !== '';

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setGhostUrl('');
      setApiKey('');
      setHasError(false);
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setHasError(false);
    try {
      const token = (await resolveAuthToken(getToken)) ?? '';
      await new ServicesService('ghost', token).postConnectWithApiKey({
        apiKey: apiKey.trim(),
        brandId,
        // The site URL is the account's identity: drop trailing slashes so
        // a reconnect typed with one still matches the stored account.
        ghostUrl: ghostUrl.trim().replace(/\/+$/, ''),
      });
      NotificationsService.getInstance().success(
        translate('ghostConnect.connected'),
      );
      handleOpenChange(false);
      await onConnected();
    } catch (error) {
      logger.error('Failed to connect Ghost', error);
      setHasError(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{translate('ghostConnect.title')}</DialogTitle>
          <DialogDescription>
            {translate('ghostConnect.description')}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <Form onSubmit={handleSubmit}>
            <Field
              htmlFor="ghost-site-url"
              isRequired
              label={translate('ghostConnect.urlLabel')}
            >
              <Input
                autoComplete="off"
                inputMode="url"
                name="ghostUrl"
                onChange={(event) => setGhostUrl(event.target.value)}
                placeholder={translate('ghostConnect.urlPlaceholder')}
                type="url"
                value={ghostUrl}
              />
            </Field>

            <Field
              helpText={translate('ghostConnect.apiKeyHelp')}
              htmlFor="ghost-admin-api-key"
              isRequired
              label={translate('ghostConnect.apiKeyLabel')}
            >
              <Input
                autoComplete="off"
                name="apiKey"
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={translate('ghostConnect.apiKeyPlaceholder')}
                type="password"
                value={apiKey}
              />
            </Field>

            {hasError ? (
              <Alert variant="destructive">
                {translate('ghostConnect.connectError')}
              </Alert>
            ) : null}

            <DialogFooter>
              <Button
                onClick={() => handleOpenChange(false)}
                size={ButtonSize.SM}
                variant={ButtonVariant.GHOST}
              >
                {translate('cancel')}
              </Button>
              <Button
                isDisabled={!canSubmit}
                isLoading={isSubmitting}
                size={ButtonSize.SM}
                type="submit"
                variant={ButtonVariant.DEFAULT}
              >
                {translate('ghostConnect.submit')}
              </Button>
            </DialogFooter>
          </Form>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
