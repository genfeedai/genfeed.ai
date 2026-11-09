'use client';

import { getAppLoginUrl, getAppSignUpUrl } from '@data/app-links';
import { ButtonSize } from '@genfeedai/contracts';
import {
  BRAND_HANDLE_FORMAT_MESSAGE,
  BRAND_HANDLE_MAX_LENGTH,
  BRAND_HANDLE_RESERVED_MESSAGE,
  isValidBrandHandle,
  normalizeBrandHandle,
  parseClaimHandle,
} from '@genfeedai/contracts/constants';
import type { ClaimHandleBandProps } from '@props/content/creator.props';
import { Button } from '@ui/primitives/button';
import Field from '@ui/primitives/field';
import { Form } from '@ui/primitives/form';
import { Input } from '@ui/primitives/input';
import { type FormEvent, useState } from 'react';

const POST_SIGNUP_PATH = '/onboarding/post-signup';

/** Where "Claim handle" goes: sign-up, carrying the handle to the brand. */
export function buildClaimSignUpHref(handle: string): string {
  return getAppSignUpUrl(`?${new URLSearchParams({ handle })}`);
}

/** Existing accounts log in and land on the same claim step. */
export function buildClaimLoginHref(handle: string): string {
  const callbackUrl = `${POST_SIGNUP_PATH}?${new URLSearchParams({ handle })}`;
  return getAppLoginUrl(`?${new URLSearchParams({ callbackUrl })}`);
}

/**
 * `genfeed.ai/@` plus a handle field. Claiming signs up (or logs in) and gives
 * the handle to the new account's brand. Whether it is free is only checked
 * once signed in, so this never tells a visitor which handles are taken.
 */
export default function ClaimHandleBand({
  id = 'claim-handle',
}: ClaimHandleBandProps): React.ReactElement {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const handle = parseClaimHandle(value);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!handle) {
      setError(
        isValidBrandHandle(normalizeBrandHandle(value))
          ? BRAND_HANDLE_RESERVED_MESSAGE
          : BRAND_HANDLE_FORMAT_MESSAGE,
      );
      return;
    }
    window.location.assign(buildClaimSignUpHref(handle));
  }

  return (
    <section
      aria-labelledby={id}
      className="border border-primary/20 bg-primary/10 p-6 md:p-8"
    >
      <div className="mx-auto max-w-2xl space-y-4 text-center">
        <h2 className="text-2xl font-semibold text-foreground" id={id}>
          Claim your @handle
        </h2>
        <p className="text-foreground/70">
          Your articles, videos and images in one public portfolio, at your own
          address.
        </p>
        <Form aria-label="Claim your handle" onSubmit={handleSubmit}>
          <Field error={error} label="Your handle">
            <Input
              autoCapitalize="none"
              autoComplete="off"
              maxLength={BRAND_HANDLE_MAX_LENGTH + 1}
              placeholder="genfeed.ai/@yourname"
              spellCheck={false}
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                setError(undefined);
              }}
            />
          </Field>
          <Button
            ariaLabel="Claim handle"
            label="Claim handle"
            size={ButtonSize.PUBLIC}
            type="submit"
            withWrapper={false}
          />
        </Form>
        {handle ? (
          <p className="text-sm text-foreground/60">
            Already on Genfeed?{' '}
            <a
              className="font-medium text-foreground hover:text-primary"
              href={buildClaimLoginHref(handle)}
            >
              Log in to claim @{handle}
            </a>
          </p>
        ) : null}
      </div>
    </section>
  );
}
