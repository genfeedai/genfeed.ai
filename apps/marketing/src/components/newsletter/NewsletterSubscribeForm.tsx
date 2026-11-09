'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { NewsletterSubscribeFormProps } from '@props/content/newsletter.props';
import { Button } from '@ui/primitives/button';
import { Form } from '@ui/primitives/form';
import { Input } from '@ui/primitives/input';
import { Text } from '@ui/typography/text';
import { type FormEvent, useState } from 'react';
import { loadPublicService } from '../../api/load-public-service';

type SubscribeState = 'idle' | 'sending' | 'sent' | 'error';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Email sign-up for a brand's newsletter (#9665, #9728). Double opt-in: the
 * reader gets a confirmation email, and the form says the same thing whether
 * or not the address was already on the list.
 */
export default function NewsletterSubscribeForm({
  brandHandle,
  brandId,
  className,
  description,
  isStacked = false,
  source,
  sourceRef,
  title,
}: NewsletterSubscribeFormProps) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<SubscribeState>('idle');

  async function resolveBrandId(): Promise<string | null> {
    if (brandId) return brandId;
    if (!brandHandle) return null;
    const service = await loadPublicService();
    const brand = await service.findPublicProfileBySlug(brandHandle);
    return brand?.id ?? null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!EMAIL_PATTERN.test(trimmed) || state === 'sending') return;
    setState('sending');
    try {
      const targetBrandId = await resolveBrandId();
      if (!targetBrandId) throw new Error('Newsletter brand not found');
      const service = await loadPublicService();
      await service.subscribeToNewsletter({
        brandId: targetBrandId,
        email: trimmed,
        source,
        ...(sourceRef ? { sourceRef } : {}),
      });
      setState('sent');
    } catch {
      setState('error');
    }
  }

  return (
    <div className={className}>
      {title ? (
        <Text as="h3" className="mb-1 text-sm font-semibold text-foreground">
          {title}
        </Text>
      ) : null}
      {description ? (
        <Text as="p" className="mb-3 text-sm leading-6 text-muted-foreground">
          {description}
        </Text>
      ) : null}
      {state === 'sent' ? (
        <Text as="p" className="text-sm text-foreground" role="status">
          Check your inbox and confirm to finish subscribing.
        </Text>
      ) : (
        <Form
          aria-label="Subscribe by email"
          className={
            isStacked
              ? 'flex flex-col gap-2'
              : 'flex flex-col gap-2 sm:flex-row'
          }
          spacing="none"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <Input
            aria-label="Email address"
            autoComplete="email"
            maxLength={254}
            placeholder="you@example.com"
            required
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (state === 'error') setState('idle');
            }}
          />
          <Button
            isDisabled={!EMAIL_PATTERN.test(email.trim())}
            isLoading={state === 'sending'}
            label="Subscribe"
            size={ButtonSize.SM}
            type="submit"
            variant={ButtonVariant.DEFAULT}
          />
        </Form>
      )}
      {state === 'error' ? (
        <Text as="p" className="mt-2 text-sm text-destructive" role="alert">
          That did not go through. Try again in a moment.
        </Text>
      ) : null}
    </div>
  );
}
