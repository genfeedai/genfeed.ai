'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { IFacebookLiveVideo } from '@genfeedai/contracts/interfaces';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import type { FacebookLiveDialogProps } from '@props/pages/brand-integrations.props';
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
import { Textarea } from '@ui/primitives/textarea';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';

/**
 * Go live on a connected Facebook Page. Starting creates the live video and
 * shows the address and key to paste into an encoder; the key is held only in
 * this dialog's state and is gone once it closes. Ending stops the broadcast
 * and shows the link to the recording.
 */
export default function FacebookLiveDialog({
  connection,
  onOpenChange,
  open,
}: FacebookLiveDialogProps) {
  const translate = useTranslations('pages.brandSocialMedia.facebookLive');
  const { getToken } = useAuthIdentity();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [live, setLive] = useState<IFacebookLiveVideo | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [hasError, setHasError] = useState(false);

  if (!connection) {
    return null;
  }

  const service = async () =>
    new ServicesService('facebook', (await resolveAuthToken(getToken)) ?? '');

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setTitle('');
      setDescription('');
      setLive(null);
      setHasError(false);
      setIsBusy(false);
    }
    onOpenChange(nextOpen);
  };

  const handleStart = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (title.trim() === '' || isBusy) {
      return;
    }
    setIsBusy(true);
    setHasError(false);
    try {
      setLive(
        await (await service()).postStartFacebookLive(connection.credentialId, {
          ...(description.trim() ? { description: description.trim() } : {}),
          title: title.trim(),
        }),
      );
    } catch (error) {
      logger.error('Failed to start a Facebook live video', error);
      setHasError(true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleEnd = async () => {
    if (!live || isBusy) {
      return;
    }
    setIsBusy(true);
    setHasError(false);
    try {
      const ended = await (await service()).postEndFacebookLive(
        connection.credentialId,
        live.postId,
      );
      setLive({
        ...live,
        ...ended,
        streamKey: undefined,
        streamUrl: undefined,
      });
      if (ended.state === 'ended') {
        NotificationsService.getInstance().success(translate('ended'));
      }
    } catch (error) {
      logger.error('Failed to end a Facebook live video', error);
      setHasError(true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      NotificationsService.getInstance().success(translate('copied'));
    } catch (error) {
      logger.error('Failed to copy the stream address', error);
    }
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{translate('title')}</DialogTitle>
          <DialogDescription>
            {translate('description', {
              page: connection.name ?? connection.label ?? '',
            })}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {live === null ? (
            <Form onSubmit={handleStart}>
              <Field
                htmlFor="facebook-live-title"
                isRequired
                label={translate('titleLabel')}
              >
                <Input
                  autoComplete="off"
                  name="title"
                  onChange={(event) => setTitle(event.target.value)}
                  value={title}
                />
              </Field>
              <Field
                htmlFor="facebook-live-description"
                label={translate('descriptionLabel')}
              >
                <Textarea
                  name="description"
                  onChange={(event) => setDescription(event.target.value)}
                  value={description}
                />
              </Field>
              {hasError ? (
                <Alert variant="destructive">{translate('startError')}</Alert>
              ) : null}
              <DialogFooter>
                <Button
                  isDisabled={title.trim() === '' || isBusy}
                  isLoading={isBusy}
                  type="submit"
                  variant={ButtonVariant.DEFAULT}
                >
                  {translate('start')}
                </Button>
              </DialogFooter>
            </Form>
          ) : live.state === 'live' ? (
            <div className="flex flex-col gap-4">
              {live.streamUrl && live.streamKey ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    {translate('encoderHelp')}
                  </p>
                  <Field
                    htmlFor="facebook-live-stream-url"
                    label={translate('streamUrlLabel')}
                  >
                    <Input isReadOnly value={live.streamUrl} />
                  </Field>
                  <Button
                    onClick={() => void handleCopy(live.streamUrl ?? '')}
                    size={ButtonSize.SM}
                    variant={ButtonVariant.SECONDARY}
                  >
                    {translate('copyUrl')}
                  </Button>
                  <Field
                    helpText={translate('streamKeyHelp')}
                    htmlFor="facebook-live-stream-key"
                    label={translate('streamKeyLabel')}
                  >
                    <Input isReadOnly type="password" value={live.streamKey} />
                  </Field>
                  <Button
                    onClick={() => void handleCopy(live.streamKey ?? '')}
                    size={ButtonSize.SM}
                    variant={ButtonVariant.SECONDARY}
                  >
                    {translate('copyKey')}
                  </Button>
                </>
              ) : null}
              {hasError ? (
                <Alert variant="destructive">{translate('endError')}</Alert>
              ) : null}
              <DialogFooter>
                <Button
                  isDisabled={isBusy}
                  isLoading={isBusy}
                  onClick={() => void handleEnd()}
                  variant={ButtonVariant.DESTRUCTIVE}
                >
                  {translate('end')}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-sm">{translate('endedDescription')}</p>
              {live.permalinkUrl ? (
                <a
                  className="text-sm underline"
                  href={live.permalinkUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {translate('viewVideo')}
                </a>
              ) : null}
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
