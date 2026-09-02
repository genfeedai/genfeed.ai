'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  formatClockTime,
  parseClockTime,
} from '@genfeedai/contracts/api-types/contracts/credential-posting-times.contract';
import type { IClockTime } from '@genfeedai/contracts/interfaces';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { CredentialsService } from '@services/organization/credentials.service';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

interface CredentialPostingTimesEditorProps {
  credentialId: string;
  initialTimes?: IClockTime[];
  onTimesChange?: (times: IClockTime[]) => void;
}

export default function CredentialPostingTimesEditor({
  credentialId,
  initialTimes = [],
  onTimesChange,
}: CredentialPostingTimesEditorProps) {
  const translate = useTranslations('pages.credentialPostingTimes');
  const { getToken } = useAuthIdentity();
  const [times, setTimes] = useState<IClockTime[]>(initialTimes);
  const [draft, setDraft] = useState('09:00');
  const [isSaving, setIsSaving] = useState(false);

  const persistChange = useCallback(
    async (mutate: (service: CredentialsService) => Promise<IClockTime[]>) => {
      setIsSaving(true);
      try {
        const token = (await resolveAuthToken(getToken)) ?? '';
        const service = CredentialsService.getInstance(token);
        const nextTimes = await mutate(service);
        setTimes(nextTimes);
        onTimesChange?.(nextTimes);
      } catch (error) {
        logger.error('Failed to save posting times', error);
        NotificationsService.getInstance().error('Save posting times');
      } finally {
        setIsSaving(false);
      }
    },
    [getToken, onTimesChange],
  );

  useEffect(() => {
    const controller = new AbortController();

    const loadTimes = async () => {
      try {
        const token = (await resolveAuthToken(getToken)) ?? '';
        if (controller.signal.aborted) {
          return;
        }
        const service = CredentialsService.getInstance(token);
        const nextTimes = await service.listPostingTimes(
          credentialId,
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setTimes(nextTimes);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          logger.error('Failed to load posting times', error);
        }
      }
    };

    void loadTimes();

    return () => {
      controller.abort();
    };
  }, [credentialId, getToken]);

  return (
    <div className="space-y-2" data-testid="posting-times-editor">
      <p className="text-xs font-medium text-foreground">
        {translate('title')}
      </p>
      <p className="text-2xs leading-4 text-muted-foreground">
        {translate('help')}
      </p>
      {times.length > 0 ? (
        <ul className="space-y-1">
          {times.map((time) => {
            const label = formatClockTime(time);
            return (
              <li
                className="flex items-center justify-between gap-2 rounded-md bg-background px-2 py-1"
                data-testid="posting-time-row"
                key={label}
              >
                <span className="text-xs font-medium tabular-nums">
                  {label}
                </span>
                <Button
                  aria-label={translate('removeAriaLabel', { label })}
                  className="h-7 px-2 text-2xs"
                  isDisabled={isSaving}
                  onClick={() => {
                    void persistChange((service) =>
                      service.removePostingTime(credentialId, time),
                    );
                  }}
                  size={ButtonSize.SM}
                  variant={ButtonVariant.GHOST}
                >
                  {translate('remove')}
                </Button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-2xs text-muted-foreground">{translate('empty')}</p>
      )}
      <div className="flex items-end gap-2">
        <Input
          aria-label={translate('newPostingTime')}
          className="h-8"
          isDisabled={isSaving}
          label={translate('addTime')}
          onChange={(event) => setDraft(event.target.value)}
          type="time"
          value={draft}
        />
        <Button
          className="h-8"
          isDisabled={isSaving || !parseClockTime(draft)}
          onClick={() => {
            const parsed = parseClockTime(draft);
            if (!parsed) {
              return;
            }
            void persistChange((service) =>
              service.addPostingTime(credentialId, parsed),
            );
          }}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
        >
          {translate('add')}
        </Button>
      </div>
    </div>
  );
}
