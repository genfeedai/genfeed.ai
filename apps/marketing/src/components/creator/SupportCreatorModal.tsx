'use client';

import { getAppUrl, getSupportCreatorHref } from '@data/app-links';
import { ButtonVariant } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  CREATOR_TIP_MAX_AMOUNT,
  CREATOR_TIP_MESSAGE_MAX_LENGTH,
  CREATOR_TIP_MIN_AMOUNT,
  CREATOR_TIP_PRESET_AMOUNTS,
} from '@genfeedai/contracts/constants';
import type { CreatorTipSendState } from '@genfeedai/props/pages/creator-tip-flow.props';
import type {
  SupportCreatorModalProps,
  SupportModalState,
} from '@props/content/creator.props';
import { getJsonApiErrorMember } from '@services/core/json-api-error-message';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { BrandAvatar } from '@ui/primitives/brand-avatar';
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
import { Input } from '@ui/primitives/input';
import { OptionTile, OptionTileGroup } from '@ui/primitives/option-tile';
import { Textarea } from '@ui/primitives/textarea';
import { Check } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

const CUSTOM_AMOUNT = 'custom';
const DEFAULT_PRESET = String(CREATOR_TIP_PRESET_AMOUNTS[1]);
const NEEDS_CREDITS_CODES: ReadonlySet<string> = new Set([
  'CREDIT_TRANSFER_REQUIRES_PURCHASE',
  'INSUFFICIENT_CREDITS',
]);

function parseAmount(choice: string, customAmount: string): number | null {
  const amount = Number(
    choice === CUSTOM_AMOUNT ? customAmount.trim() : choice,
  );
  return Number.isInteger(amount) &&
    amount >= CREATOR_TIP_MIN_AMOUNT &&
    amount <= CREATOR_TIP_MAX_AMOUNT
    ? amount
    : null;
}

function formatCredits(amount: number): string {
  return `${amount.toLocaleString('en-US')} ${amount === 1 ? 'credit' : 'credits'}`;
}

async function loadPaymentsService(signal?: AbortSignal) {
  const { getSignedInBetterAuthToken } = await import('@genfeedai/auth-client');
  const token = await getSignedInBetterAuthToken({ signal });
  if (!token) {
    return null;
  }
  const { CreatorPaymentsService } = await import(
    '@services/billing/creator-payments.service'
  );
  return CreatorPaymentsService.getInstance(token);
}

/**
 * The Support modal on a public profile or article (#9716): a signed-in
 * reader sends credits from their own organization. A signed-out reader is
 * sent to the app to sign in, which brings them back to the support page.
 */
export default function SupportCreatorModal({
  articleId,
  handle,
  onOpenChange,
}: SupportCreatorModalProps): React.ReactElement {
  const [state, setState] = useState<SupportModalState>({ status: 'loading' });
  const [choice, setChoice] = useState(DEFAULT_PRESET);
  const [customAmount, setCustomAmount] = useState('');
  const [message, setMessage] = useState('');
  const [sendState, setSendState] = useState<CreatorTipSendState>({
    status: 'idle',
  });
  // One key per intended tip: a double click or a retry sends it once.
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    globalThis.crypto.randomUUID(),
  );

  useEffect(() => {
    const controller = new AbortController();
    async function loadTarget(): Promise<void> {
      try {
        const service = await loadPaymentsService(controller.signal);
        if (!service) {
          setState({ status: 'signed-out' });
          return;
        }
        const target = await service.getTipTarget(handle, controller.signal);
        if (!controller.signal.aborted) {
          setState({ status: 'ready', target });
        }
      } catch {
        if (!controller.signal.aborted) {
          setState({ status: 'missing' });
        }
      }
    }
    void loadTarget();
    return () => controller.abort();
  }, [handle]);

  const amount = useMemo(
    () => parseAmount(choice, customAmount),
    [choice, customAmount],
  );

  const send = useCallback(async () => {
    if (amount === null || state.status !== 'ready') {
      return;
    }
    setSendState({ status: 'sending' });
    try {
      const service = await loadPaymentsService();
      if (!service) {
        setState({ status: 'signed-out' });
        return;
      }
      const result = await service.sendTip({
        amount,
        ...(articleId ? { articleId } : {}),
        handle,
        idempotencyKey,
        ...(message.trim() ? { message: message.trim() } : {}),
      });
      setSendState({ result, status: 'sent' });
      setIdempotencyKey(globalThis.crypto.randomUUID());
    } catch (error) {
      const code = getJsonApiErrorMember(error)?.code;
      setSendState({
        status:
          typeof code === 'string' && NEEDS_CREDITS_CODES.has(code)
            ? 'needs-credits'
            : 'failed',
      });
    }
  }, [amount, articleId, handle, idempotencyKey, message, state.status]);

  const label = state.status === 'ready' ? state.target.label : `@${handle}`;
  const isSending = sendState.status === 'sending';

  if (sendState.status === 'sent') {
    return (
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent size="sm">
          <DialogBody className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/20 text-primary">
              <Check className="size-5" aria-hidden="true" />
            </div>
            <DialogTitle>Credits sent</DialogTitle>
            <DialogDescription>
              {formatCredits(sendState.result.amount)} sent to{' '}
              {sendState.result.creatorLabel}. Your balance is now{' '}
              {sendState.result.balanceAfter.toLocaleString('en-US')}.
            </DialogDescription>
          </DialogBody>
          <DialogFooter>
            <Button
              label="Done"
              onClick={() => onOpenChange(false)}
              textTransform="none"
              variant={ButtonVariant.DEFAULT}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <BrandAvatar alt={label} name={label} size="lg" />
            <div className="flex min-w-0 flex-col text-left">
              <DialogTitle>Support {label}</DialogTitle>
              <span className="text-sm text-muted-foreground">@{handle}</span>
            </div>
          </div>
          <DialogDescription className="text-left">
            Send credits to @{handle}. They spend them on generation in Genfeed.
          </DialogDescription>
        </DialogHeader>

        {state.status === 'loading' ? (
          <DialogBody>
            <p className="text-sm text-muted-foreground">Loading…</p>
          </DialogBody>
        ) : null}

        {state.status === 'missing' ? (
          <DialogBody>
            <Alert variant="destructive">
              <AlertTitle>Support is unavailable</AlertTitle>
              <AlertDescription>
                We couldn&apos;t load @{handle}. Try again in a moment.
              </AlertDescription>
            </Alert>
          </DialogBody>
        ) : null}

        {state.status === 'signed-out' ? (
          <>
            <DialogBody>
              <Alert>
                <AlertTitle>Sign in to send credits</AlertTitle>
                <AlertDescription>
                  Credits come from your Genfeed workspace. Sign in or create a
                  free account to support @{handle}.
                </AlertDescription>
              </Alert>
            </DialogBody>
            <DialogFooter>
              <Button
                label="Not now"
                onClick={() => onOpenChange(false)}
                textTransform="none"
                variant={ButtonVariant.GHOST}
              />
              <Button
                asChild
                textTransform="none"
                variant={ButtonVariant.DEFAULT}
                withWrapper={false}
              >
                <a href={getSupportCreatorHref(handle, articleId)}>Sign in</a>
              </Button>
            </DialogFooter>
          </>
        ) : null}

        {state.status === 'ready' && !state.target.isTippable ? (
          <DialogBody>
            <Alert>
              <AlertTitle>This is your own workspace</AlertTitle>
              <AlertDescription>
                You can&apos;t send credits to a creator whose workspace you
                belong to.
              </AlertDescription>
            </Alert>
          </DialogBody>
        ) : null}

        {state.status === 'ready' && state.target.isTippable ? (
          <>
            <DialogBody className="flex flex-col gap-4">
              <OptionTileGroup
                ariaLabel="Amount"
                columns={4}
                isDisabled={isSending}
                onValueChange={setChoice}
                value={choice}
              >
                {CREATOR_TIP_PRESET_AMOUNTS.map((preset) => (
                  <OptionTile
                    key={preset}
                    title={String(preset)}
                    value={String(preset)}
                  />
                ))}
                <OptionTile title="Other" value={CUSTOM_AMOUNT} />
              </OptionTileGroup>

              {choice === CUSTOM_AMOUNT ? (
                <Field
                  helpText={`A whole number from ${CREATOR_TIP_MIN_AMOUNT} to ${CREATOR_TIP_MAX_AMOUNT.toLocaleString('en-US')}.`}
                  htmlFor="support-amount"
                  label="Other amount"
                >
                  <Input
                    id="support-amount"
                    inputMode="numeric"
                    max={CREATOR_TIP_MAX_AMOUNT}
                    min={CREATOR_TIP_MIN_AMOUNT}
                    onChange={(event) => setCustomAmount(event.target.value)}
                    type="number"
                    value={customAmount}
                  />
                </Field>
              ) : null}

              <Field htmlFor="support-message" label="Message (optional)">
                <Textarea
                  id="support-message"
                  maxLength={CREATOR_TIP_MESSAGE_MAX_LENGTH}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Say what you liked"
                  rows={3}
                  value={message}
                />
              </Field>

              {sendState.status === 'needs-credits' ? (
                <Alert>
                  <AlertTitle>Not enough credits</AlertTitle>
                  <AlertDescription>
                    Buy credits to send this amount. Free trial credits
                    can&apos;t be sent to other creators.
                  </AlertDescription>
                </Alert>
              ) : null}
              {sendState.status === 'failed' ? (
                <Alert variant="destructive">
                  <AlertDescription>
                    The credits didn&apos;t go through. Try again.
                  </AlertDescription>
                </Alert>
              ) : null}
            </DialogBody>
            <DialogFooter>
              <Button
                label="Cancel"
                onClick={() => onOpenChange(false)}
                textTransform="none"
                variant={ButtonVariant.GHOST}
              />
              {sendState.status === 'needs-credits' ? (
                <Button
                  asChild
                  textTransform="none"
                  variant={ButtonVariant.DEFAULT}
                  withWrapper={false}
                >
                  <a href={getAppUrl(APP_ROUTES.ROOT)}>Buy credits</a>
                </Button>
              ) : (
                <Button
                  isDisabled={amount === null || isSending}
                  label={
                    isSending
                      ? 'Sending…'
                      : amount === null
                        ? 'Send credits'
                        : `Send ${formatCredits(amount)}`
                  }
                  onClick={() => void send()}
                  textTransform="none"
                  variant={ButtonVariant.DEFAULT}
                />
              )}
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
