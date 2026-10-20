'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { ONBOARDING_MAX_DRAFT_ROUNDS } from '@genfeedai/contracts/constants';
import { Button } from '@ui/primitives/button';
import Field from '@ui/primitives/field';
import { Form } from '@ui/primitives/form';
import { Input } from '@ui/primitives/input';
import Spinner from '@ui/primitives/spinner';
import { useTranslations } from 'next-intl';
import ContextForm from './context-form';
import DraftCard from './draft-card';
import { useFirstDrafts } from './use-first-drafts';

/**
 * The one onboarding page: a link in, first posts out. Brand context is only
 * asked for when the first drafts don't look right, and never more than
 * `ONBOARDING_MAX_DRAFT_ROUNDS` rounds.
 */
export default function FirstDraftsOnboarding() {
  const t = useTranslations('pages.onboarding.firstDrafts');
  const state = useFirstDrafts();

  if (!state.isReady) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner ariaLabel={t('loading')} className="size-6 text-foreground" />
      </div>
    );
  }

  if (state.phase === 'working') {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4">
        <Spinner className="size-6 text-foreground" />
        <p role="status" className="text-muted-foreground">
          {t(`working.${state.workingStep}`)}
        </p>
      </div>
    );
  }

  if (state.phase === 'context') {
    return (
      <ContextForm
        audienceSuggestions={state.scan?.summary?.suggestions?.audiences ?? []}
        hasError={state.error === 'generate'}
        isScanFailed={state.isScanFailed}
        isWebsiteMissing={state.scan === null}
        offerSuggestions={state.scan?.summary?.suggestions?.offers ?? []}
        onSubmit={state.onSubmitContext}
      />
    );
  }

  if (state.phase === 'review' && state.result) {
    const { drafts, imageUrl, status } = state.result;
    const brandName = state.scan?.summary?.name;
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold">{t('review.title')}</h1>
          <p className="text-muted-foreground">
            {brandName
              ? t('review.description', { brand: brandName })
              : t('review.descriptionNoBrand')}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('review.round', {
              max: ONBOARDING_MAX_DRAFT_ROUNDS,
              round: state.round,
            })}
          </p>
        </div>

        {status === 'unavailable' ? (
          <p role="status" className="text-muted-foreground">
            {t('review.unavailable')}
          </p>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              {drafts.map((draft) => (
                <DraftCard
                  key={draft.postId}
                  draft={draft}
                  imageUrl={imageUrl}
                />
              ))}
            </div>
            {status === 'partial' ? (
              <p role="status" className="text-sm text-muted-foreground">
                {t('review.partial')}
              </p>
            ) : null}
          </>
        )}

        {state.error === 'continue' ? (
          <p role="alert" className="text-sm text-destructive">
            {t('errors.continue')}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button
            label={
              status === 'unavailable'
                ? t('review.continueAnyway')
                : t('review.looksRight')
            }
            isLoading={state.isContinuing}
            onClick={state.onContinue}
          />
          {state.canRetry && status !== 'unavailable' ? (
            <Button
              label={t('review.notRight')}
              variant={ButtonVariant.SECONDARY}
              isDisabled={state.isContinuing}
              onClick={state.onNotRight}
            />
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <Form
      spacing="section"
      onSubmit={(event) => {
        event.preventDefault();
        state.onStart();
      }}
    >
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">{t('url.title')}</h1>
        <p className="text-muted-foreground">{t('url.description')}</p>
      </div>
      <Field label={t('url.label')}>
        <Input
          value={state.url}
          placeholder={t('url.placeholder')}
          autoFocus
          onChange={(event) => state.onUrlChange(event.target.value)}
        />
      </Field>
      {state.error === 'generate' ? (
        <p role="alert" className="text-sm text-destructive">
          {t('errors.generate')}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button
          type="submit"
          label={t('url.submit')}
          isDisabled={state.url.trim().length === 0}
        />
        <Button
          label={t('url.noWebsite')}
          variant={ButtonVariant.GHOST}
          onClick={state.onSkipLink}
        />
      </div>
    </Form>
  );
}
