'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import type {
  ApiKeyConnectDialogProps,
  ApiKeyConnectTarget,
} from '@props/pages/brand-integrations.props';
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
import { type FormEvent, useRef, useState } from 'react';
import {
  getApiKeyConnectFormFields,
  resolveApiKeyConnectErrorMessageKey,
} from '@/features/brands/components/integrations/api-key-connect-form.util';

const TRAILING_SLASHES_PATTERN = /\/+$/;

/**
 * Ghost, dev.to and Beehiiv authenticate with an API key, not an OAuth
 * redirect. The server verifies the key against the provider before storing
 * it and names the reason when it refuses, which the form shows in place.
 */
export default function ApiKeyConnectDialog({
  brandId,
  onConnected,
  onOpenChange,
  open,
  target,
}: ApiKeyConnectDialogProps) {
  const translate = useTranslations('pages.brandSocialMedia');
  const { getToken } = useAuthIdentity();
  const [siteUrl, setSiteUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [publicationId, setPublicationId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessageKey, setErrorMessageKey] = useState<string | null>(null);
  const [formTarget, setFormTarget] = useState<ApiKeyConnectTarget | null>(
    null,
  );
  // Bumped on every close and new target: a request still in flight from an
  // earlier opening must not close or fill the form shown now.
  const submissionGeneration = useRef(0);

  // Each opening passes a new target; start its form from the account being
  // reconnected, if any.
  if (target !== formTarget) {
    setFormTarget(target);
    if (target) {
      const targetFields = getApiKeyConnectFormFields(target.platform);
      const externalId = target.reconnectExternalId ?? '';
      setSiteUrl(targetFields.hasSiteUrl ? externalId : '');
      setPublicationId(targetFields.hasPublicationId ? externalId : '');
      setApiKey('');
      setErrorMessageKey(null);
      setIsSubmitting(false);
    }
  }

  if (!target) {
    return null;
  }

  const fields = getApiKeyConnectFormFields(target.platform);
  const messages = `apiKeyConnect.${target.servicePath}`;
  const canSubmit =
    apiKey.trim() !== '' && (!fields.hasSiteUrl || siteUrl.trim() !== '');

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      submissionGeneration.current += 1;
      setSiteUrl('');
      setApiKey('');
      setPublicationId('');
      setErrorMessageKey(null);
      setIsSubmitting(false);
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || isSubmitting) {
      return;
    }

    submissionGeneration.current += 1;
    const generation = submissionGeneration.current;
    const isCurrent = () => submissionGeneration.current === generation;
    setIsSubmitting(true);
    setErrorMessageKey(null);
    try {
      const token = (await resolveAuthToken(getToken)) ?? '';
      const trimmedPublicationId = publicationId.trim();
      await new ServicesService(
        target.servicePath,
        token,
      ).postConnectWithApiKey({
        apiKey: apiKey.trim(),
        brandId,
        // The site URL is the account's identity: drop trailing slashes so
        // a reconnect typed with one still matches the stored account.
        ...(fields.hasSiteUrl
          ? { ghostUrl: siteUrl.trim().replace(TRAILING_SLASHES_PATTERN, '') }
          : {}),
        ...(fields.hasPublicationId && trimmedPublicationId
          ? { publicationId: trimmedPublicationId }
          : {}),
      });
      if (isCurrent()) {
        NotificationsService.getInstance().success(
          translate(`${messages}.connected`),
        );
        handleOpenChange(false);
      }
      await onConnected();
    } catch (error) {
      logger.error(`Failed to connect ${target.servicePath}`, error);
      if (isCurrent()) {
        setErrorMessageKey(resolveApiKeyConnectErrorMessageKey(error));
      }
    } finally {
      if (isCurrent()) {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{translate(`${messages}.title`)}</DialogTitle>
          <DialogDescription>
            {translate(`${messages}.description`)}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <Form onSubmit={handleSubmit}>
            {fields.hasSiteUrl ? (
              <Field
                htmlFor="api-key-connect-site-url"
                isRequired
                label={translate(`${messages}.urlLabel`)}
              >
                <Input
                  autoComplete="off"
                  inputMode="url"
                  name="ghostUrl"
                  onChange={(event) => setSiteUrl(event.target.value)}
                  placeholder={translate(`${messages}.urlPlaceholder`)}
                  // `url` would refuse `myblog.com`, which the server accepts.
                  type="text"
                  value={siteUrl}
                />
              </Field>
            ) : null}

            <Field
              helpText={translate(`${messages}.apiKeyHelp`)}
              htmlFor="api-key-connect-key"
              isRequired
              label={translate(`${messages}.apiKeyLabel`)}
            >
              <Input
                autoComplete="off"
                name="apiKey"
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={translate(`${messages}.apiKeyPlaceholder`)}
                type="password"
                value={apiKey}
              />
            </Field>

            {fields.hasPublicationId ? (
              <Field
                helpText={translate(`${messages}.publicationIdHelp`)}
                htmlFor="api-key-connect-publication-id"
                label={translate(`${messages}.publicationIdLabel`)}
              >
                <Input
                  autoComplete="off"
                  name="publicationId"
                  onChange={(event) => setPublicationId(event.target.value)}
                  placeholder={translate(
                    `${messages}.publicationIdPlaceholder`,
                  )}
                  value={publicationId}
                />
              </Field>
            ) : null}

            {errorMessageKey ? (
              <Alert variant="destructive">
                {translate(`apiKeyConnect.${errorMessageKey}`)}
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
                {translate(`${messages}.submit`)}
              </Button>
            </DialogFooter>
          </Form>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
