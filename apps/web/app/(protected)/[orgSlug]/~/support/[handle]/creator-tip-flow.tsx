'use client';

import { ButtonVariant, CardPadding } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  CREATOR_TIP_MAX_AMOUNT,
  CREATOR_TIP_MESSAGE_MAX_LENGTH,
  CREATOR_TIP_MIN_AMOUNT,
  CREATOR_TIP_PRESET_AMOUNTS,
  createOrganizationAppRoute,
  creatorProfilePath,
} from '@genfeedai/contracts/constants';
import type {
  ICreatorTipResult,
  ICreatorTipTarget,
} from '@genfeedai/contracts/interfaces/billing';
import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import { CreatorPaymentsService } from '@genfeedai/services/billing/creator-payments.service';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { EnvironmentService } from '@services/core/environment.service';
import { getJsonApiErrorMember } from '@services/core/json-api-error-message';
import { logger } from '@services/core/logger.service';
import Card from '@ui/card/Card';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import Field from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import { OptionTile, OptionTileGroup } from '@ui/primitives/option-tile';
import { Textarea } from '@ui/primitives/textarea';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';

const CUSTOM_AMOUNT = 'custom';
const LEADING_AT_PATTERN = /^@/;
const DEFAULT_PRESET = String(CREATOR_TIP_PRESET_AMOUNTS[1]);
const NEEDS_CREDITS_CODES: ReadonlySet<string> = new Set([
  'CREDIT_TRANSFER_REQUIRES_PURCHASE',
  'INSUFFICIENT_CREDITS',
]);

type TargetState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'ready'; target: ICreatorTipTarget };

type SendState =
  | { status: 'idle' }
  | { status: 'sending' }
  | { status: 'needs-credits' }
  | { status: 'failed' }
  | { result: ICreatorTipResult; status: 'sent' };

function parseAmount(choice: string, customAmount: string): number | null {
  const raw = choice === CUSTOM_AMOUNT ? customAmount.trim() : choice;
  const amount = Number(raw);
  return Number.isInteger(amount) &&
    amount >= CREATOR_TIP_MIN_AMOUNT &&
    amount <= CREATOR_TIP_MAX_AMOUNT
    ? amount
    : null;
}

function newIdempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * A signed-in reader tips a creator from their own organization's credits
 * (#9716). Reached from the Tip button on a public profile or article.
 */
export default function CreatorTipFlow() {
  const translate = useTranslations('pages.creatorTip');
  const { handle: rawHandle, orgSlug } = useRouteParams<{
    handle: string;
    orgSlug: string;
  }>();
  const handle = decodeURIComponent(rawHandle ?? '').replace(
    LEADING_AT_PATTERN,
    '',
  );
  const articleId = useSearchParams().get('article') ?? undefined;
  const getService = useAuthedService(
    useCallback(
      (token: string) => CreatorPaymentsService.getInstance(token),
      [],
    ),
  );
  const [targetState, setTargetState] = useState<TargetState>({
    status: 'loading',
  });
  const [choice, setChoice] = useState<string>(DEFAULT_PRESET);
  const [customAmount, setCustomAmount] = useState('');
  const [message, setMessage] = useState('');
  const [sendState, setSendState] = useState<SendState>({ status: 'idle' });
  // One key per intended tip: a double click or a retry sends it once.
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  useEffect(() => {
    if (!handle) {
      setTargetState({ status: 'missing' });
      return;
    }
    const controller = new AbortController();
    void (async () => {
      try {
        const service = await getService();
        const target = await service.getTipTarget(handle, controller.signal);
        if (!controller.signal.aborted) {
          setTargetState({ status: 'ready', target });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          logger.error('Loading the tip target failed', error);
          setTargetState({ status: 'missing' });
        }
      }
    })();
    return () => controller.abort();
  }, [getService, handle]);

  const amount = useMemo(
    () => parseAmount(choice, customAmount),
    [choice, customAmount],
  );
  const creditsHref = orgSlug
    ? createOrganizationAppRoute(orgSlug, APP_ROUTES.SETTINGS.CREDITS)
    : APP_ROUTES.ROOT;
  const profileHref = `${EnvironmentService.apps.website}${creatorProfilePath(handle)}`;

  const send = async () => {
    if (amount === null || targetState.status !== 'ready') {
      return;
    }
    setSendState({ status: 'sending' });
    try {
      const service = await getService();
      const result = await service.sendTip({
        amount,
        ...(articleId ? { articleId } : {}),
        handle,
        idempotencyKey,
        ...(message.trim() ? { message: message.trim() } : {}),
      });
      setSendState({ result, status: 'sent' });
      setIdempotencyKey(newIdempotencyKey());
    } catch (error) {
      const code = getJsonApiErrorMember(error)?.code;
      if (typeof code === 'string' && NEEDS_CREDITS_CODES.has(code)) {
        setSendState({ status: 'needs-credits' });
        return;
      }
      logger.error('Sending the tip failed', error);
      setSendState({ status: 'failed' });
    }
  };

  if (targetState.status === 'loading') {
    return (
      <Card padding={CardPadding.LG} label={translate('loading')}>
        {null}
      </Card>
    );
  }

  if (targetState.status === 'missing') {
    return (
      <Alert variant="destructive">
        <AlertTitle>{translate('notFoundTitle')}</AlertTitle>
        <AlertDescription>
          {translate('notFoundDescription', { handle })}
        </AlertDescription>
      </Alert>
    );
  }

  const { target } = targetState;

  if (sendState.status === 'sent') {
    return (
      <Card
        padding={CardPadding.LG}
        label={translate('sentTitle')}
        description={translate('sentDescription', {
          amount: sendState.result.amount,
          balance: sendState.result.balanceAfter,
          creator: sendState.result.creatorLabel,
        })}
      >
        <Link href={profileHref}>
          {translate('backToProfile', { handle: target.handle })}
        </Link>
      </Card>
    );
  }

  return (
    <Card
      padding={CardPadding.LG}
      label={translate('title', { creator: target.label })}
      description={translate('description', { handle: target.handle })}
    >
      {target.isTippable ? (
        <div className="flex flex-col gap-4">
          <OptionTileGroup
            ariaLabel={translate('amountLabel')}
            columns={4}
            onValueChange={(value) => setChoice(value)}
            value={choice}
            isDisabled={sendState.status === 'sending'}
          >
            {CREATOR_TIP_PRESET_AMOUNTS.map((preset) => (
              <OptionTile
                key={preset}
                value={String(preset)}
                title={translate('presetAmount', { amount: preset })}
              />
            ))}
            <OptionTile
              value={CUSTOM_AMOUNT}
              title={translate('customAmountLabel')}
            />
          </OptionTileGroup>

          {choice === CUSTOM_AMOUNT ? (
            <Field
              htmlFor="creator-tip-amount"
              label={translate('customAmountLabel')}
              helpText={translate('customAmountHelp', {
                max: CREATOR_TIP_MAX_AMOUNT,
                min: CREATOR_TIP_MIN_AMOUNT,
              })}
            >
              <Input
                id="creator-tip-amount"
                inputMode="numeric"
                min={CREATOR_TIP_MIN_AMOUNT}
                max={CREATOR_TIP_MAX_AMOUNT}
                onChange={(event) => setCustomAmount(event.target.value)}
                type="number"
                value={customAmount}
              />
            </Field>
          ) : null}

          <Field
            htmlFor="creator-tip-message"
            label={translate('messageLabel')}
          >
            <Textarea
              id="creator-tip-message"
              maxLength={CREATOR_TIP_MESSAGE_MAX_LENGTH}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={translate('messagePlaceholder')}
              rows={3}
              value={message}
            />
          </Field>

          {sendState.status === 'needs-credits' ? (
            <Alert>
              <AlertTitle>{translate('needCreditsTitle')}</AlertTitle>
              <AlertDescription>
                {translate('needCreditsDescription')}{' '}
                <Link href={creditsHref}>{translate('buyCredits')}</Link>
              </AlertDescription>
            </Alert>
          ) : null}
          {sendState.status === 'failed' ? (
            <Alert variant="destructive">
              <AlertDescription>{translate('failed')}</AlertDescription>
            </Alert>
          ) : null}

          <Button
            variant={ButtonVariant.DEFAULT}
            label={
              sendState.status === 'sending'
                ? translate('sending')
                : translate('send', { amount: amount ?? 0 })
            }
            isDisabled={amount === null || sendState.status === 'sending'}
            onClick={() => void send()}
          />
        </div>
      ) : (
        <Alert>
          <AlertTitle>{translate('ownTeamTitle')}</AlertTitle>
          <AlertDescription>{translate('ownTeamDescription')}</AlertDescription>
        </Alert>
      )}
    </Card>
  );
}
