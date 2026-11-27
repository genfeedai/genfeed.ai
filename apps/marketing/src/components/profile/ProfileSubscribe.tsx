'use client';

import { getFollowSignUpHref } from '@data/app-links';
import { ButtonVariant } from '@genfeedai/contracts';
import type { ProfileSubscribeProps } from '@props/content/creator.props';
import { Button } from '@ui/primitives/button';
import { ButtonGroup, ButtonGroupText } from '@ui/primitives/button-group';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import ButtonTracked from '@web-components/buttons/tracked/ButtonTracked';
import { Bell, Check, Mail, UserPlus } from 'lucide-react';
import { useState } from 'react';

type SubscribeState =
  | 'idle'
  | 'sending'
  | 'subscribed'
  | 'confirmation-sent'
  | 'error';

/**
 * Subscribe to a creator's newsletter in one click. A signed-in reader is
 * subscribed with their own account email, with no form. A signed-out reader
 * first sees what subscribing involves, then goes through Genfeed sign-up, and
 * the app subscribes the new account once it exists.
 */
export default function ProfileSubscribe({
  handle,
  source,
  layout = 'bar',
  sourceRef,
  variant = ButtonVariant.DEFAULT,
}: ProfileSubscribeProps) {
  const [state, setState] = useState<SubscribeState>('idle');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const isSubscribed = state === 'subscribed';
  const isPending = state === 'confirmation-sent';
  const isDone = isSubscribed || isPending;
  const isCompact = layout === 'compact';
  const buttonLabel = isSubscribed
    ? 'Subscribed'
    : isPending
      ? 'Confirmation pending'
      : 'Subscribe';
  const Icon = isSubscribed ? Check : isPending ? Mail : Bell;

  async function handleSubscribe() {
    if (state === 'sending' || isDone) {
      return;
    }
    setState('sending');
    try {
      const { getSignedInBetterAuthToken } = await import(
        '@genfeedai/auth-client'
      );
      const token = await getSignedInBetterAuthToken();
      if (!token) {
        setState('idle');
        setIsModalOpen(true);
        return;
      }
      const { NewsletterAccountService } = await import(
        '@services/content/newsletter-account.service'
      );
      const result = await NewsletterAccountService.getInstance(
        token,
      ).subscribe({ handle, source, ...(sourceRef ? { sourceRef } : {}) });
      setState(
        result.status === 'subscribed' ? 'subscribed' : 'confirmation-sent',
      );
    } catch {
      setState('error');
    }
  }

  const subscribePoints = [
    {
      body: `Every issue @${handle} publishes, by email.`,
      icon: Mail,
      title: 'What you get',
    },
    {
      body: 'A Genfeed account. Sign up with Google or an email link.',
      icon: UserPlus,
      title: 'What you need',
    },
    {
      body: `When your account is ready, we subscribe you to the @${handle} newsletter for you.`,
      icon: Check,
      title: 'What happens next',
    },
  ];

  const subscribeButton = (
    <ButtonTracked
      className={isCompact ? undefined : 'flex-1'}
      isDisabled={isDone}
      isLoading={state === 'sending'}
      onClick={() => void handleSubscribe()}
      trackingData={{
        action: 'profile_subscribe',
        label: 'Subscribe',
        profile: handle,
        source,
      }}
      trackingName="creator_subscribe_click"
      type="button"
      variant={variant}
      withWrapper={false}
    >
      <Icon aria-hidden="true" className="size-4" />
      {buttonLabel}
    </ButtonTracked>
  );

  return (
    <div className="space-y-2">
      {isCompact ? (
        subscribeButton
      ) : (
        <ButtonGroup aria-label="Subscribe to the newsletter">
          <ButtonGroupText>
            <Mail aria-hidden="true" />
            Newsletter
          </ButtonGroupText>
          {subscribeButton}
        </ButtonGroup>
      )}
      <Dialog onOpenChange={setIsModalOpen} open={isModalOpen}>
        <DialogContent data-testid="subscribe-modal" size="md">
          <DialogHeader>
            <DialogTitle>Subscribe to @{handle}</DialogTitle>
            <DialogDescription>
              Get the newsletter in your inbox.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <ul className="flex flex-col gap-4">
              {subscribePoints.map((point) => (
                <li className="flex items-start gap-3" key={point.title}>
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-tertiary">
                    <point.icon aria-hidden="true" className="size-4" />
                  </span>
                  <div>
                    <p className="text-sm font-medium">{point.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {point.body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </DialogBody>
          <DialogFooter>
            <Button
              label="Cancel"
              onClick={() => setIsModalOpen(false)}
              type="button"
              variant={ButtonVariant.SECONDARY}
            />
            <ButtonTracked
              label="Continue"
              onClick={() =>
                window.location.assign(getFollowSignUpHref(handle))
              }
              trackingData={{
                action: 'profile_subscribe_continue',
                label: 'Continue',
                profile: handle,
                source,
              }}
              trackingName="creator_subscribe_continue_click"
              type="button"
              variant={ButtonVariant.DEFAULT}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {state === 'confirmation-sent' ? (
        <p className="text-sm text-foreground" role="status">
          Check your inbox and confirm to finish subscribing.
        </p>
      ) : null}
      {state === 'error' ? (
        <p className="text-sm text-destructive" role="alert">
          That did not go through. Try again in a moment.
        </p>
      ) : null}
    </div>
  );
}
