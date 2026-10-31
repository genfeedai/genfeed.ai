'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { logger } from '@services/core/logger.service';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import Spinner from '@ui/primitives/spinner';
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
import ClipperInputForm from '../components/ClipperInputForm';
import { findClipperPreset } from '../data/clipper-presets';
import { ClipperApiService } from '../services/clipper-api.service';
import { useStudioClipperPage } from '../useStudioClipperPage';

let pendingCreation: { key: string; promise: Promise<string> } | null = null;

/**
 * One create per visit: a remount while the request is in flight (StrictMode,
 * a fast re-render) joins the same request instead of creating a second
 * project. The slot frees once it settles, so the next visit creates anew.
 */
function createClipperProjectOnce(
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

function IngredientClipperProjectPageContent() {
  const t = useTranslations('pages.studioClipper');
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
    () => new ClipperApiService(resolveToken),
    [resolveToken],
  );

  // A plain string, so the create effect does not re-run when `t` changes.
  const createFailedMessage = t('projectCreateFailed');

  useEffect(() => {
    if (!isBrandReady || !videoId) {
      return;
    }

    let isActive = true;
    const brandId = selectedBrand?.id;

    createClipperProjectOnce(`${brandId ?? ''}:${videoId ?? ''}`, async () =>
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
          replace(href(`${APP_ROUTES.STUDIO.CLIPPER}/${projectId}`));
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
      : href(APP_ROUTES.STUDIO.CLIPPER);
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

function ClipperSourceImport() {
  const t = useTranslations('pages.studioClipper');
  const clips = useStudioClipperPage();
  const preset = findClipperPreset(useSearchParams().get('preset'));
  const { setGenerationMode, setMaxClips, setMinViralityScore } = clips;
  const hasAppliedPreset = useRef(false);

  // A preset only chooses settings; the creator still adds the source.
  useEffect(() => {
    if (!preset || hasAppliedPreset.current) {
      return;
    }

    hasAppliedPreset.current = true;
    setGenerationMode(preset.mode);
    setMaxClips(preset.maxClips);
    setMinViralityScore(preset.minViralityScore);
  }, [preset, setGenerationMode, setMaxClips, setMinViralityScore]);

  return (
    <Container label={t('newProject')} titleVisibility="sr-only">
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <h1 className="text-xl font-semibold">{t('importSourceTitle')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('importSourceDescription')}
        </p>
        {preset ? (
          <p className="text-sm text-muted-foreground" role="status">
            {t('presets.appliedStatus', {
              count: preset.maxClips,
              score: preset.minViralityScore,
              title: t(`presets.items.${preset.id}.title`),
            })}
          </p>
        ) : null}
        <ClipperInputForm
          sourceOnly
          draftSaveState={clips.draftSaveState}
          error={clips.error}
          generationMode={clips.generationMode}
          isSubmitting={clips.isSubmitting}
          maxClips={clips.maxClips}
          minViralityScore={clips.minViralityScore}
          onAnalyze={clips.handleAnalyze}
          onModeChange={clips.setGenerationMode}
          onStartQuick={clips.handleStartFromYoutube}
          onSetMaxClips={clips.setMaxClips}
          onSetMinViralityScore={clips.setMinViralityScore}
          onSetSourceFile={clips.setSourceFile}
          onSetSourceKind={clips.setSourceKind}
          onSetYoutubeUrl={clips.setYoutubeUrl}
          quickStartHint=""
          sourceFile={clips.sourceFile}
          sourceKind={clips.sourceKind}
          uploadProgress={clips.uploadProgress}
          youtubeUrl={clips.youtubeUrl}
        />
      </div>
    </Container>
  );
}

function NewClipperProjectPageContent() {
  const searchParams = useSearchParams();
  return searchParams.get('video') ? (
    <IngredientClipperProjectPageContent />
  ) : (
    <ClipperSourceImport />
  );
}

export default function NewClipperProjectPage() {
  return (
    <Suspense fallback={null}>
      <NewClipperProjectPageContent />
    </Suspense>
  );
}
