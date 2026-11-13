'use client';
import OnboardingProgress from '@app/(onboarding)/onboarding/components/onboarding-progress';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonSize, ButtonVariant, CardPadding } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  ONBOARDING_DRAFT_PLATFORMS,
} from '@genfeedai/contracts/constants';
import type { ConnectGenfeedClient } from '@genfeedai/contracts/interfaces';
import { useThemeLogo } from '@hooks/ui/use-theme-logo/use-theme-logo';
import Card from '@ui/card/Card';
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
import DesktopSidebar from '@/components/layouts/app/DesktopSidebar';
import AgentStep from './agent-step';
import ChannelsStep from './channels-step';
import ConnectPlatforms from './connect-platforms';
import ContextForm from './context-form';
import DraftCard from './draft-card';
import PromptStep from './prompt-step';
import UnderstoodLine from './understood-line';
import { useFirstDrafts } from './use-first-drafts';

const GALLERY_ORDER = ['instagram', 'tiktok', 'twitter', 'linkedin'];

export default function FirstDraftsOnboarding() {
  const t = useTranslations('pages.onboarding.firstDrafts');
  const state = useFirstDrafts();
  const { brandId, selectedBrand } = useBrand();
  const logoUrl = useThemeLogo();
  const [skipOpen, setSkipOpen] = useState(false);
  const [agentClient, setAgentClient] =
    useState<ConnectGenfeedClient>('claude-code');
  const mainRef = useRef<HTMLElement>(null);
  const step =
    state.phase === 'prompt'
      ? 3
      : state.phase === 'channels'
        ? 2
        : state.phase === 'agent'
          ? 1
          : 0;
  const labels = [
    t('steps.output'),
    t('steps.agent'),
    t('steps.channels'),
    t('steps.prompt'),
  ];
  const loading = !state.isReady || state.isRestoring;
  const result = state.result;
  const canContinue =
    Boolean(result) &&
    (state.phase === 'url' ||
      state.phase === 'review' ||
      state.phase === 'agent' ||
      state.phase === 'channels' ||
      state.phase === 'prompt');
  const canSkipStep = state.phase === 'agent' || state.phase === 'channels';
  const brandName =
    state.scan?.summary?.name || selectedBrand?.label || t('brandFallback');

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
                  loading || state.isContinuing || (index > 0 && !result),
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
            {canSkipStep && !loading && (
              <Button
                size={ButtonSize.SM}
                variant={ButtonVariant.GHOST}
                label={t('actions.skipStep')}
                isDisabled={state.isContinuing}
                onClick={() => {
                  state.onAdvance();
                  if (mainRef.current) mainRef.current.scrollTop = 0;
                }}
              />
            )}
            {canContinue && !loading && (
              <Button
                size={ButtonSize.SM}
                isLoading={state.isContinuing}
                onClick={() => {
                  state.onAdvance();
                  if (mainRef.current) mainRef.current.scrollTop = 0;
                }}
              >
                {t(
                  state.phase === 'prompt'
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
                  initial={result ? (state.understood ?? undefined) : undefined}
                  isScanFailed={state.isScanFailed}
                  isWebsiteMissing={state.scan === null}
                  offerSuggestions={
                    state.scan?.summary?.suggestions?.offers ?? []
                  }
                  onCancel={result ? state.onCancelRedo : undefined}
                  onSubmit={state.onSubmitContext}
                />
              </div>
            ) : state.phase === 'agent' && result ? (
              <AgentStep client={agentClient} onClientChange={setAgentClient} />
            ) : state.phase === 'channels' && result ? (
              <ChannelsStep brandId={brandId} />
            ) : state.phase === 'prompt' && result ? (
              <PromptStep brandName={brandName} client={agentClient} />
            ) : state.phase === 'review' && result ? (
              <div className="mx-auto flex max-w-5xl flex-col gap-6">
                <UnderstoodLine
                  canRedo={state.canRetry}
                  isBusy={state.isGenerating || state.isContinuing}
                  maxRounds={state.maxRounds}
                  onNotRight={state.onNotRight}
                  round={state.round}
                  understood={state.understood}
                />
                <Card padding={CardPadding.MD}>
                  <div className="grid items-center gap-6 md:grid-cols-[minmax(0,280px)_1fr]">
                    {result.imageUrl ? (
                      <Image
                        src={result.imageUrl}
                        alt={t('masterAlt', { brand: brandName })}
                        width={560}
                        height={560}
                        unoptimized
                        className="aspect-square w-full rounded-md object-cover"
                      />
                    ) : (
                      <div className="flex aspect-square w-full items-center justify-center rounded-md bg-muted">
                        {state.isGenerating ? <Spinner /> : null}
                      </div>
                    )}
                    <div className="flex flex-col gap-2">
                      <h2 className="text-sm font-medium">
                        {t('review.masterTitle')}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {t('review.masterDescription')}
                      </p>
                    </div>
                  </div>
                </Card>
                <h2 className="text-sm font-medium">
                  {t('review.derivedTitle')}
                </h2>
                <div className="-mx-1 flex snap-x gap-6 overflow-x-auto px-1 pb-2">
                  {result.drafts
                    .toSorted(
                      (left, right) =>
                        GALLERY_ORDER.indexOf(left.platform) -
                        GALLERY_ORDER.indexOf(right.platform),
                    )
                    .map((draft) => (
                      <div
                        key={draft.postId}
                        className="w-[320px] shrink-0 snap-start"
                      >
                        <DraftCard
                          draft={draft}
                          images={(result.campaignImages ?? []).filter(
                            (image) => image.platform === draft.platform,
                          )}
                          masterUrl={result.imageUrl}
                          brandName={
                            state.scan?.summary?.name || selectedBrand?.label
                          }
                          avatarUrl={
                            state.scan?.summary?.logoUrl ||
                            selectedBrand?.logoUrl
                          }
                          isSaving={state.savingPostIds.includes(draft.postId)}
                          isMediaGenerating={state.isGenerating}
                          onRetryMedia={
                            state.canRetryMedia ? state.onRetryMedia : undefined
                          }
                          onVerdict={state.onVerdict}
                          verdict={state.verdicts[draft.postId]}
                        />
                      </div>
                    ))}
                </div>
                <p className="text-sm text-muted-foreground">
                  {t('review.videoWithCredits')}
                </p>
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
              <div className="mx-auto mt-8 max-w-xl">
                <Form
                  spacing="none"
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
                      onChange={(event) =>
                        state.onUrlChange(event.target.value)
                      }
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
                {brandId && (
                  <section
                    aria-labelledby="connect-for-context-title"
                    className="mt-10 flex flex-col gap-4"
                  >
                    <div className="flex flex-col gap-1">
                      <h2
                        id="connect-for-context-title"
                        className="text-sm font-semibold"
                      >
                        {t('url.connect.title')}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {t('url.connect.description')}
                      </p>
                    </div>
                    <ConnectPlatforms
                      brandId={brandId}
                      returnTo={APP_ROUTES.ONBOARDING.BRAND}
                    />
                  </section>
                )}
              </div>
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
