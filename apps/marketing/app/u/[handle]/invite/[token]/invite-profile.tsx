'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { IPublicContentPreview } from '@genfeedai/contracts/interfaces';
import { cn } from '@genfeedai/helpers';
import { deserializeResource } from '@helpers/data/json-api/json-api.helper';
import type {
  InviteProfileLoadState,
  InviteProfileProps,
  InviteUnlockStatus,
} from '@props/pages/invite-profile.props';
import { EnvironmentService } from '@services/core/environment.service';
import BrandProfileHeader, {
  hasBrandProfileHeaderOverlap,
} from '@ui/brand/BrandProfileHeader';
import CollectionSection from '@ui/collection/CollectionSection';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Skeleton } from '@ui/primitives/skeleton';
import LockedPostList from '@web-components/profile/LockedPostList';
import { useEffect, useRef, useState } from 'react';

function inviteUrl(token: string, suffix = ''): string {
  return `${EnvironmentService.apiEndpoint}/public/previews/${encodeURIComponent(token)}${suffix}`;
}

const EXPIRY_FORMAT = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeZone: 'UTC',
});

/**
 * A lead's own profile, locked. Only the invite key opens it, and only under
 * the brand's own handle: the bare handle answers 404 while the brand is
 * private. Everything prepared is visible; keeping it needs the email the
 * profile was prepared for, so a forwarded link cannot take the workspace.
 */
export default function InviteProfile({ handle, token }: InviteProfileProps) {
  const [unlockStatus, setUnlockStatus] = useState<InviteUnlockStatus>('idle');
  const hasCountedView = useRef(false);
  const [state, setState] = useState<InviteProfileLoadState>({
    status: 'loading',
  });

  useEffect(() => {
    const controller = new AbortController();

    async function load(): Promise<void> {
      try {
        const response = await fetch(inviteUrl(token), {
          cache: 'no-store',
          referrerPolicy: 'no-referrer',
          signal: controller.signal,
        });
        if (!response.ok) {
          setState({ status: 'unavailable' });
          return;
        }
        const invite = deserializeResource<IPublicContentPreview>(
          await response.json(),
        );
        // A key opens only its own profile: under any other handle it is
        // the same dead link as an unknown key.
        setState(
          invite.handle.toLowerCase() === handle.toLowerCase()
            ? { invite, status: 'ready' }
            : { status: 'unavailable' },
        );
      } catch {
        if (!controller.signal.aborted) setState({ status: 'unavailable' });
      }
    }

    void load();
    return () => controller.abort();
  }, [handle, token]);

  // One visit is one count: the read itself never counts, so a refresh of the
  // data or a strict-mode remount cannot add a second view.
  useEffect(() => {
    if (state.status !== 'ready' || hasCountedView.current) return;
    hasCountedView.current = true;
    void fetch(inviteUrl(token, '/view'), {
      keepalive: true,
      method: 'POST',
      referrerPolicy: 'no-referrer',
    }).catch(() => undefined);
  }, [state.status, token]);

  async function unlock(): Promise<void> {
    setUnlockStatus('sending');
    try {
      const response = await fetch(inviteUrl(token, '/claim'), {
        method: 'POST',
        referrerPolicy: 'no-referrer',
      });
      setUnlockStatus(response.ok ? 'sent' : 'failed');
    } catch {
      setUnlockStatus('failed');
    }
  }

  if (state.status === 'loading') {
    return (
      <div
        aria-busy="true"
        aria-label="Loading your profile"
        className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 py-8"
        role="status"
      >
        <Skeleton className="aspect-[3/1] w-full" />
        <Skeleton className="h-6 w-40 self-center" variant="text" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (state.status === 'unavailable') {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-2 px-4 text-center">
        <h1 className="text-xl font-semibold text-foreground">
          This invite link is no longer active
        </h1>
        <p className="text-sm text-muted-foreground">
          It expired or was replaced. Ask the person who sent it for a new link.
        </p>
      </div>
    );
  }

  const { brand, expiresAt, handle: inviteHandle, items } = state.invite;
  const contextRows = [
    { label: 'Tone', value: brand.tone },
    { label: 'Style', value: brand.style },
  ].filter((row) => Boolean(row.value));
  const contextLists = [
    { label: 'Audience', values: brand.audience },
    { label: 'Values', values: brand.values },
    { label: 'Messaging', values: brand.messagingPillars },
  ].filter((row) => (row.values?.length ?? 0) > 0);
  const colors = [brand.primaryColor, brand.secondaryColor].filter(
    (color): color is string => Boolean(color),
  );
  const hasContext =
    contextRows.length > 0 || contextLists.length > 0 || colors.length > 0;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-8">
      <BrandProfileHeader
        bannerSizes="(min-width: 768px) 28rem, 100vw"
        bannerUrl={brand.bannerUrl}
        label={brand.name}
        logoUrl={brand.logoUrl}
      />

      <div
        className={cn(
          'flex flex-col items-center gap-2 text-center',
          hasBrandProfileHeaderOverlap(brand.bannerUrl) ? 'pt-14' : 'pt-4',
        )}
      >
        <h1 className="text-2xl font-semibold text-foreground">{brand.name}</h1>
        <p className="text-sm text-muted-foreground">@{inviteHandle}</p>
        {brand.description ? (
          <p className="max-w-prose text-sm text-foreground/70">
            {brand.description}
          </p>
        ) : null}
        <Badge variant="info">
          Private · only the invited email can unlock it
        </Badge>
      </div>

      <CollectionSection
        description={`We prepared this profile and its content for you. The link opens until ${EXPIRY_FORMAT.format(new Date(expiresAt))}.`}
        title="Unlock your profile"
      >
        {unlockStatus === 'sent' ? (
          <p className="text-sm" role="status">
            Check your inbox. We sent an unlock link to the address this profile
            was prepared for. Open it to sign in and keep everything here.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {unlockStatus === 'failed' ? (
              <p className="text-sm text-muted-foreground" role="alert">
                We could not send the link. Try again in a minute.
              </p>
            ) : null}
            <Button
              className="w-full"
              isDisabled={unlockStatus === 'sending'}
              onClick={() => void unlock()}
              size={ButtonSize.PUBLIC}
              variant={ButtonVariant.DEFAULT}
            >
              Email me the unlock link
            </Button>
          </div>
        )}
      </CollectionSection>

      {hasContext ? (
        <CollectionSection
          description="Read from your website. You can edit all of it once you unlock."
          title="What we know about you"
        >
          <dl className="flex flex-col gap-3 text-sm">
            {contextRows.map((row) => (
              <div className="flex flex-col gap-0.5" key={row.label}>
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className="text-foreground">{row.value}</dd>
              </div>
            ))}
            {contextLists.map((row) => (
              <div className="flex flex-col gap-1" key={row.label}>
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className="flex flex-wrap gap-1.5">
                  {row.values?.map((value) => (
                    <Badge key={value} variant="secondary">
                      {value}
                    </Badge>
                  ))}
                </dd>
              </div>
            ))}
            {colors.length > 0 ? (
              <div className="flex flex-col gap-1">
                <dt className="text-muted-foreground">Colors</dt>
                <dd className="flex gap-2">
                  {colors.map((color) => (
                    <span
                      aria-label={color}
                      className="size-6 rounded-full border border-border"
                      key={color}
                      role="img"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </dd>
              </div>
            ) : null}
          </dl>
        </CollectionSection>
      ) : null}

      <CollectionSection
        description="Ready to post. Unlock to edit, download or schedule it."
        title="Made for you"
      >
        <LockedPostList emptyMessage="Nothing to show yet." items={items} />
      </CollectionSection>
    </div>
  );
}
