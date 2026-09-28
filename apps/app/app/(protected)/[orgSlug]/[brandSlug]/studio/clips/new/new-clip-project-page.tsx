'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { logger } from '@services/core/logger.service';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { ClipsApiService } from '../services/clips-api.service';

function NewClipProjectPageContent() {
  const t = useTranslations('pages.studioClips');
  const { replace } = useRouter();
  const { href } = useOrgUrl();
  const searchParams = useSearchParams();
  const videoId = searchParams.get('video');
  const { getToken } = useAuthIdentity();
  const { isReady: isBrandReady, selectedBrand } = useBrand();
  const creating = useRef(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const resolveToken = useCallback(async (): Promise<string> => {
    return (await resolveAuthToken(getToken)) ?? '';
  }, [getToken]);

  const clipsService = useMemo(
    () => new ClipsApiService(resolveToken),
    [resolveToken],
  );

  useEffect(() => {
    if (!isBrandReady || creating.current) {
      return;
    }
    creating.current = true;

    const controller = new AbortController();
    const brandId = selectedBrand?.id;

    (async () => {
      try {
        // Aborting in cleanup runs synchronously before this microtask, so a
        // StrictMode-discarded mount bails out before creating a project.
        await Promise.resolve();
        if (controller.signal.aborted) {
          return;
        }

        const projectId = videoId
          ? (
              await clipsService.createFromIngredient({
                brandId,
                ingredientId: videoId,
              })
            ).projectId
          : await clipsService.createDraft(brandId);
        if (controller.signal.aborted) {
          return;
        }

        replace(href(`${APP_ROUTES.STUDIO.CLIPS}/${projectId}`));
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        logger.error('Failed to create clip project', error);
        setRefusal(
          error instanceof Error && error.message
            ? error.message
            : 'The clip project could not be created.',
        );
      }
    })();

    return () => {
      controller.abort();
      creating.current = false;
    };
  }, [clipsService, href, isBrandReady, replace, selectedBrand?.id, videoId]);

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
      <div className="size-12 animate-spin rounded-full border-b-2 border-t-2 border-primary" />
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
