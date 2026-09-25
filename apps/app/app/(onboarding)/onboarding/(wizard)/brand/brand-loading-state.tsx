import { AlertCategory, ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { BrandLoadingStateProps } from '@props/onboarding/brand-loading-state.props';
import Alert from '@ui/feedback/alert/Alert';
import { Button } from '@ui/primitives/button';
import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * The domain loading step: sets up the workspace from the brand's domain and
 * drafts a starter post + ad in the background. Never blocks on the
 * background draft — see `brand-content.tsx`.
 */
export default function BrandLoadingState({
  errorMessage,
  onSkip,
  submitting,
}: BrandLoadingStateProps) {
  const translate = useTranslations('pages.onboarding.brand');

  return (
    <div className="flex max-w-lg flex-col items-center pt-16 text-center">
      <div className="mb-8 flex size-16 items-center justify-center rounded-full border border-border bg-background-tertiary">
        <Sparkles className="size-6 animate-pulse text-foreground" />
      </div>

      <h1 className="mb-4 text-4xl font-semibold leading-none tracking-tight text-foreground md:text-5xl text-balance">
        {translate('loading.title')}
      </h1>
      <p className="mb-10 text-lg text-muted-foreground">
        {translate('loading.description')}
      </p>

      <div
        className="size-6 border-2 border-border border-t-foreground rounded-full animate-spin"
        role="status"
        aria-label={translate('loading.title')}
      />

      <div className="mt-8 w-full" hidden={!errorMessage}>
        {errorMessage ? (
          <Alert type={AlertCategory.ERROR}>
            <div className="space-y-1">
              <div className="font-medium">{translate('errors.title')}</div>
              <div className="text-xs text-foreground/70">{errorMessage}</div>
            </div>
          </Alert>
        ) : null}
      </div>

      <Button
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
        size={ButtonSize.SM}
        label={translate('actions.skip')}
        isDisabled={submitting}
        onClick={onSkip}
        className="mt-8 text-xs text-muted-foreground underline decoration-border-strong underline-offset-4 transition hover:text-foreground"
      />
    </div>
  );
}
