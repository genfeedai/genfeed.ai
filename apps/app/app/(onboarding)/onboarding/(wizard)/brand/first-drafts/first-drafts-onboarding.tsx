'use client';
import OnboardingProgress from '@app/(onboarding)/onboarding/components/onboarding-progress';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  ONBOARDING_DRAFT_PLATFORMS,
} from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useThemeLogo } from '@hooks/ui/use-theme-logo/use-theme-logo';
import OrderedMasonry from '@ui/display/masonry/OrderedMasonry';
import DesktopSidebar from '@ui/layouts/app/DesktopSidebar';
import { Button } from '@ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import { Form } from '@ui/primitives/form';
import { Input } from '@ui/primitives/input';
import Spinner from '@ui/primitives/spinner';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import ContextForm from './context-form';
import DraftCard from './draft-card';
import ScheduleStep from './schedule-step';
import { useFirstDrafts } from './use-first-drafts';

const GALLERY_ORDER = ['instagram', 'tiktok', 'twitter', 'linkedin'];

export default function FirstDraftsOnboarding() {
  const t = useTranslations('pages.onboarding.firstDrafts');
  const state = useFirstDrafts();
  const { brandId, selectedBrand } = useBrand();
  const { orgHref, orgSlug } = useOrgUrl();
  const logoUrl = useThemeLogo();
  const [skipOpen, setSkipOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const step =
    state.phase === 'schedule'
      ? 3
      : state.phase === 'review'
        ? 2
        : state.phase === 'working'
          ? 1
          : 0;
  const labels = [
    t('steps.brand'),
    t('steps.create'),
    t('steps.review'),
    t('steps.connect'),
  ];
  const loading = !state.isReady || state.isRestoring;
  const canContinue =
    Boolean(state.result) &&
    (state.phase === 'url' ||
      state.phase === 'review' ||
      state.phase === 'schedule');
  const result = state.result;

  return (
    <div className="h-dvh overflow-hidden bg-gray-100 [--desktop-sidebar-width:220px]">
      <header className="flex h-12 items-center gap-3 px-6">
        {logoUrl && (
          <Image
            src={logoUrl}
            alt={t('appName')}
            width={22}
            height={22}
            className="dark:invert"
          />
        )}
        <span className="text-xs font-semibold">{t('appName')}</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {labels[step]}
        </span>
      </header>
      <div className="flex h-[calc(100dvh-3.5rem)] overflow-hidden border border-border bg-background md:mx-2 md:rounded-lg">
        <DesktopSidebar
          embedded
          isCollapsed={false}
          width={220}
          ariaLabel={t('progress')}
        >
          <div className="p-3">
            <p className="px-2.5 pb-5 pt-3 text-xs font-medium uppercase text-muted-foreground">
              {t('gettingStarted')}
            </p>
            <OnboardingProgress
              orientation="vertical"
              currentStep={step}
              totalSteps={4}
              stepLabels={labels}
              disabledSteps={[0, 1, 2, 3].filter(
                (index) =>
                  loading ||
                  state.isContinuing ||
                  (index === 1 && (!state.isGenerating || Boolean(result))) ||
                  (index > 1 && !result),
              )}
              onStepChange={(index) => {
                state.onNavigate(index);
                if (mainRef.current) mainRef.current.scrollTop = 0;
              }}
            />
          </div>
        </DesktopSidebar>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            className="flex min-h-14 shrink-0 items-center justify-end gap-2 border-b border-border px-4 md:px-7"
            role="toolbar"
            aria-label={t('actions.label')}
          >
            {state.phase !== 'url' && !loading && (
              <Button
                className="mr-auto"
                withWrapper={false}
                ariaLabel={t('actions.back')}
                size={ButtonSize.SM}
                variant={ButtonVariant.GHOST}
                isDisabled={state.isContinuing}
                onClick={() => {
                  state.onBack();
                  if (mainRef.current) mainRef.current.scrollTop = 0;
                }}
              >
                <ArrowLeft className="size-4" />
              </Button>
            )}
            <Button
              size={ButtonSize.SM}
              variant={ButtonVariant.GHOST}
              label={t('actions.skip')}
              isDisabled={state.isContinuing}
              onClick={() => setSkipOpen(true)}
            />
            {canContinue && !loading && (
              <Button
                size={ButtonSize.SM}
                isLoading={state.isContinuing}
                onClick={() => {
                  state.phase === 'schedule'
                    ? state.onContinue()
                    : state.phase === 'url'
                      ? state.onStart()
                      : state.onSchedule();
                  if (mainRef.current) mainRef.current.scrollTop = 0;
                }}
              >
                {t(
                  state.phase === 'schedule'
                    ? 'actions.finish'
                    : 'actions.continue',
                )}
                <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
          <main
            ref={mainRef}
            className="min-h-0 flex-1 overflow-auto p-4 md:p-7"
            aria-label={labels[step]}
          >
            {loading ? (
              <div className="flex min-h-[40vh] items-center justify-center">
                <Spinner ariaLabel={t('loading')} />
              </div>
            ) : state.phase === 'working' ? (
              <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4">
                <Spinner />
                <p role="status" className="text-sm text-muted-foreground">
                  {t(`working.${state.workingStep}`)}
                </p>
              </div>
            ) : state.phase === 'context' ? (
              <div className="mx-auto max-w-xl">
                <ContextForm
                  audienceSuggestions={
                    state.scan?.summary?.suggestions?.audiences ?? []
                  }
                  hasError={state.error === 'generate'}
                  isScanFailed={state.isScanFailed}
                  isWebsiteMissing={state.scan === null}
                  offerSuggestions={
                    state.scan?.summary?.suggestions?.offers ?? []
                  }
                  onSubmit={state.onSubmitContext}
                />
              </div>
            ) : state.phase === 'schedule' && result ? (
              <ScheduleStep brandId={brandId} />
            ) : state.phase === 'review' && result ? (
              <div className="mx-auto max-w-5xl">
                <OrderedMasonry minColumnWidth={420} maxColumns={2} gap={24}>
                  {result.drafts
                    .toSorted(
                      (left, right) =>
                        GALLERY_ORDER.indexOf(left.platform) -
                        GALLERY_ORDER.indexOf(right.platform),
                    )
                    .map((draft) => (
                      <DraftCard
                        key={draft.postId}
                        draft={draft}
                        imageUrl={result.imageUrl}
                        videoUrl={result.videoUrl}
                        videoStatus={result.videoStatus}
                        brandName={
                          state.scan?.summary?.name || selectedBrand?.label
                        }
                        avatarUrl={
                          state.scan?.summary?.logoUrl || selectedBrand?.logoUrl
                        }
                        isSaving={state.savingPostIds.includes(draft.postId)}
                        isMediaGenerating={state.isGenerating}
                        upgradeHref={
                          orgSlug
                            ? orgHref(APP_ROUTES.SETTINGS.SUBSCRIPTION)
                            : undefined
                        }
                        onRetryMedia={
                          state.canRetryMedia ? state.onRetryMedia : undefined
                        }
                        onVerdict={state.onVerdict}
                        verdict={state.verdicts[draft.postId]}
                      />
                    ))}
                </OrderedMasonry>
                {!state.isGenerating &&
                  !result.imageUrl &&
                  result.drafts.length > 0 && (
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <p
                        role="status"
                        className="text-sm text-muted-foreground"
                      >
                        {t('review.imageFailed')}
                      </p>
                      {state.canRetryMedia && (
                        <Button
                          size={ButtonSize.SM}
                          variant={ButtonVariant.SECONDARY}
                          label={t('review.retryMedia')}
                          onClick={state.onRetryMedia}
                        />
                      )}
                    </div>
                  )}
                {!state.isGenerating &&
                  result.drafts.length < ONBOARDING_DRAFT_PLATFORMS.length && (
                    <p
                      role="status"
                      className="mt-4 text-sm text-muted-foreground"
                    >
                      {t(
                        result.status === 'unavailable'
                          ? 'review.unavailable'
                          : 'review.partial',
                      )}
                    </p>
                  )}
              </div>
            ) : (
              <Form
                spacing="none"
                className="mx-auto mt-8 max-w-xl"
                onSubmit={(event) => {
                  event.preventDefault();
                  state.onStart();
                }}
              >
                <h1 className="text-2xl font-semibold">{t('url.title')}</h1>
                <p
                  id="brand-link-help"
                  className="mt-3 text-sm text-muted-foreground"
                >
                  {t('url.description')}
                </p>
                <div className="mt-6 flex items-center gap-2">
                  <Input
                    aria-label={t('url.label')}
                    aria-describedby="brand-link-help"
                    value={state.url}
                    placeholder={t('url.placeholder')}
                    autoComplete="url"
                    className="min-w-0 flex-1"
                    onChange={(event) => state.onUrlChange(event.target.value)}
                  />
                  <Button
                    type="submit"
                    ariaLabel={t('url.submit')}
                    isDisabled={!state.url.trim()}
                  >
                    <ArrowRight className="size-4" />
                  </Button>
                </div>
                <Button
                  className="mt-3"
                  size={ButtonSize.SM}
                  variant={ButtonVariant.GHOST}
                  label={t('url.noWebsite')}
                  onClick={state.onSkipLink}
                />
              </Form>
            )}
            {state.error && (
              <p
                role="alert"
                className="mx-auto mt-4 max-w-5xl text-sm text-destructive"
              >
                {t(`errors.${state.error}`)}
              </p>
            )}
          </main>
        </div>
      </div>
      <Dialog open={skipOpen} onOpenChange={setSkipOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('skip.title')}</DialogTitle>
            <DialogDescription>{t('skip.description')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant={ButtonVariant.SECONDARY}
              label={t('actions.skip')}
              isLoading={state.isContinuing}
              onClick={() => {
                setSkipOpen(false);
                state.onContinue();
              }}
            />
            <Button label={t('skip.stay')} onClick={() => setSkipOpen(false)} />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
