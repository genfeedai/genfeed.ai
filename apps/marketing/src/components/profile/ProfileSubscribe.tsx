'use client';

import { getFollowSignUpHref } from '@data/app-links';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { ProfileSubscribeProps } from '@props/content/creator.props';
import { ButtonGroup, ButtonGroupText } from '@ui/primitives/button-group';
import ButtonTracked from '@web-components/buttons/tracked/ButtonTracked';
import { Bell, Check, Mail } from 'lucide-react';
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
 * goes through Genfeed sign-up, and the app subscribes the new account once
 * it exists.
 */
export default function ProfileSubscribe({
  handle,
  source,
  layout = 'bar',
  sourceRef,
  variant = ButtonVariant.DEFAULT,
}: ProfileSubscribeProps) {
  const [state, setState] = useState<SubscribeState>('idle');
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
        // The page is replaced, so the button keeps spinning until it is.
        window.location.assign(getFollowSignUpHref(handle));
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

  const subscribeButton = (
    <ButtonTracked
      className={isCompact ? undefined : 'flex-1'}
      isDisabled={isDone}
      isLoading={state === 'sending'}
      onClick={() => void handleSubscribe()}
      size={isCompact ? ButtonSize.SM : undefined}
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
