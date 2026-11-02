'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { IPublicContentPreview } from '@genfeedai/contracts/interfaces';
import { cn } from '@genfeedai/helpers';
import { deserializeResource } from '@helpers/data/json-api/json-api.helper';
import { EnvironmentService } from '@services/core/environment.service';
import BrandProfileHeader, {
  hasBrandProfileHeaderOverlap,
} from '@ui/brand/BrandProfileHeader';
import ContentFeed from '@ui/brand/ContentFeed';
import CollectionSection from '@ui/collection/CollectionSection';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Skeleton } from '@ui/primitives/skeleton';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type {
  ContentPreviewClaimStatus,
  ContentPreviewContentProps,
  ContentPreviewLoadState,
} from '@/features/content-preview/props/content-preview-content.props';

function previewUrl(token: string, suffix = ''): string {
  return `${EnvironmentService.apiEndpoint}/public/previews/${encodeURIComponent(token)}${suffix}`;
}

export default function ContentPreviewContent({
  token,
}: ContentPreviewContentProps) {
  const translate = useTranslations('common.contentPreview');
  const format = useFormatter();
  const [claimStatus, setClaimStatus] =
    useState<ContentPreviewClaimStatus>('idle');
  const hasCountedView = useRef(false);
  const [state, setState] = useState<ContentPreviewLoadState>({
    status: 'loading',
  });

  useEffect(() => {
    const controller = new AbortController();

    async function load(): Promise<void> {
      try {
        const response = await fetch(previewUrl(token), {
          cache: 'no-store',
          referrerPolicy: 'no-referrer',
          signal: controller.signal,
        });
        if (!response.ok) {
          setState({ status: 'unavailable' });
          return;
        }
        const preview = deserializeResource<IPublicContentPreview>(
          await response.json(),
        );
        setState({ preview, status: 'ready' });
      } catch {
        if (!controller.signal.aborted) setState({ status: 'unavailable' });
      }
    }

    void load();
    return () => controller.abort();
  }, [token]);

  // One visit is one count: the read itself never counts, so a refresh of the
  // data or a strict-mode remount cannot add a second view.
  useEffect(() => {
    if (state.status !== 'ready' || hasCountedView.current) return;
    hasCountedView.current = true;
    void fetch(previewUrl(token, '/view'), {
      keepalive: true,
      method: 'POST',
      referrerPolicy: 'no-referrer',
    }).catch(() => undefined);
  }, [state.status, token]);

  async function claim(): Promise<void> {
    setClaimStatus('sending');
    try {
      const response = await fetch(previewUrl(token, '/claim'), {
        method: 'POST',
        referrerPolicy: 'no-referrer',
      });
      setClaimStatus(response.ok ? 'sent' : 'failed');
    } catch {
      setClaimStatus('failed');
    }
  }

  if (state.status === 'loading') {
    return (
      <main
        aria-busy="true"
        aria-label={translate('loading')}
        className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 py-6"
      >
        <Skeleton className="aspect-[3/1] w-full" />
        <Skeleton className="h-6 w-40 self-center" variant="text" />
        <Skeleton className="h-48 w-full" />
      </main>
    );
  }

  if (state.status === 'unavailable') {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-2 px-4 text-center">
        <h1 className="text-xl font-semibold text-foreground">
          {translate('unavailable.title')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {translate('unavailable.description')}
        </p>
      </main>
    );
  }

  const { brand, expiresAt, items } = state.preview;
  const contextRows = [
    { label: translate('context.tone'), value: brand.tone },
    { label: translate('context.style'), value: brand.style },
  ].filter((row) => Boolean(row.value));
  const contextLists = [
    { label: translate('context.audience'), values: brand.audience },
    { label: translate('context.values'), values: brand.values },
    {
      label: translate('context.messagingPillars'),
      values: brand.messagingPillars,
    },
  ].filter((row) => (row.values?.length ?? 0) > 0);
  const colors = [brand.primaryColor, brand.secondaryColor].filter(
    (color): color is string => Boolean(color),
  );
  const hasContext =
    contextRows.length > 0 || contextLists.length > 0 || colors.length > 0;

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 pb-8 pt-6">
        <BrandProfileHeader
          bannerSizes="(min-width: 640px) 36rem, 100vw"
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
          <h1 className="text-2xl font-semibold text-foreground">
            {brand.name}
          </h1>
          {brand.description ? (
            <p className="max-w-prose text-sm text-foreground/70">
              {brand.description}
            </p>
          ) : null}
          <Badge variant="info">
            {translate('opensUntil', {
              date: format.dateTime(new Date(expiresAt), {
                dateStyle: 'medium',
              }),
            })}
          </Badge>
        </div>

        {hasContext ? (
          <CollectionSection
            description={translate('context.description')}
            title={translate('context.title')}
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
                  <dt className="text-muted-foreground">
                    {translate('context.colors')}
                  </dt>
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

        <CollectionSection title={translate('feed.title')}>
          <ContentFeed
            authorAvatarUrl={brand.logoUrl}
            authorName={brand.name}
            emptyMessage={translate('feed.empty')}
            items={items}
            statusLabel={translate('feed.status')}
          />
        </CollectionSection>
      </div>

      <div className="sticky bottom-0 border-t border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-xl items-center justify-between gap-4 px-4 py-3">
          {claimStatus === 'sent' ? (
            <p className="text-sm" role="status">
              {translate('claim.sent')}
            </p>
          ) : (
            <>
              <p
                className="text-sm text-muted-foreground sm:max-w-sm"
                role={claimStatus === 'failed' ? 'alert' : undefined}
              >
                {claimStatus === 'failed'
                  ? translate('claim.failed')
                  : translate('claim.prompt')}
              </p>
              <Button
                className="w-full sm:w-auto"
                isDisabled={claimStatus === 'sending'}
                onClick={() => void claim()}
                size={ButtonSize.PUBLIC}
                variant={ButtonVariant.DEFAULT}
              >
                {translate('claim.action')}
              </Button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
