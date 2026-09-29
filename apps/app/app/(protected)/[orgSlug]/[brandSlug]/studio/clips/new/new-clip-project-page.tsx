'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { logger } from '@services/core/logger.service';
import { Button } from '@ui/primitives/button';
import Spinner from '@ui/primitives/spinner';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';

import { ClipsApiService } from '../services/clips-api.service';

let pendingCreation: { key: string; promise: Promise<string> } | null = null;

/**
 * One create per visit: a remount while the request is in flight (StrictMode,
 * a fast re-render) joins the same request instead of creating a second
 * project. The slot frees once it settles, so the next visit creates anew.
 */
function createClipProjectOnce(
  key: string,
  create: () => Promise<string>,
): Promise<string> {
  if (pendingCreation?.key === key) {
    return pendingCreation.promise;
  }

  const promise = create().finally(() => {
    if (pendingCreation?.promise === promise) {
      pendingCreation = null;
    }
  });
  pendingCreation = { key, promise };
  return promise;
}

function NewClipProjectPageContent() {
  const t = useTranslations('pages.studioClips');
  const { replace } = useRouter();
  const { href } = useOrgUrl();
  const searchParams = useSearchParams();
  const videoId = searchParams.get('video');
  const { getToken } = useAuthIdentity();
  const { isReady: isBrandReady, selectedBrand } = useBrand();
  const [refusal, setRefusal] = useState<string | null>(null);

  const resolveToken = useCallback(async (): Promise<string> => {
    return (await resolveAuthToken(getToken)) ?? '';
  }, [getToken]);

  const clipsService = useMemo(
    () => new ClipsApiService(resolveToken),
    [resolveToken],
  );

  // A plain string, so the create effect does not re-run when `t` changes.
  const createFailedMessage = t('projectCreateFailed');

  useEffect(() => {
    if (!isBrandReady) {
      return;
    }

    let isActive = true;
    const brandId = selectedBrand?.id;

    createClipProjectOnce(`${brandId ?? ''}:${videoId ?? ''}`, async () =>
      videoId
        ? (
            await clipsService.createFromIngredient({
              brandId,
              ingredientId: videoId,
            })
          ).projectId
        : await clipsService.createDraft(brandId),
    )
      .then((projectId) => {
        if (isActive) {
          replace(href(`${APP_ROUTES.STUDIO.CLIPS}/${projectId}`));
        }
      })
      .catch((error: unknown) => {
        if (!isActive) {
          return;
        }
        logger.error('Failed to create clip project', error);
        setRefusal(
          error instanceof Error && error.message
            ? error.message
            : createFailedMessage,
        );
      });

    return () => {
      isActive = false;
    };
  }, [
    clipsService,
    createFailedMessage,
    href,
    isBrandReady,
    replace,
    selectedBrand?.id,
    videoId,
  ]);

  if (refusal) {
    const backHref = videoId
      ? href(APP_ROUTES.LIBRARY.ASSETS)
      : href(APP_ROUTES.STUDIO.CLIPS);
    const backLabel = videoId ? t('backToLibrary') : t('backToClips');

    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-24 text-center">
        <h1 className="text-lg font-semibold text-foreground">
          {t('projectNotStarted')}
        </h1>
        <p className="text-sm text-muted-foreground" role="alert">
          {refusal}
        </p>
        <Button
          asChild
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          label={backLabel}
        >
          <Link href={backHref}>{backLabel}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div
      className="flex h-screen items-center justify-center"
      role="status"
      aria-label={t('creatingProject')}
    >
      <Spinner className="size-12 text-primary" />
    </div>
  );
}

export default function NewClipProjectPage() {
  return (
    <Suspense fallback={null}>
      <NewClipProjectPageContent />
    </Suspense>
  );
}
