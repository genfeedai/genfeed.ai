import { AlertCategory, ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { BrandWebsitePromptProps } from '@props/onboarding/brand-website-prompt.props';
import Alert from '@ui/feedback/alert/Alert';
import { Button } from '@ui/primitives/button';
import { Form } from '@ui/primitives/form';
import { Input } from '@ui/primitives/input';
import { ArrowRight, Globe } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * Shown only for personal inboxes (gmail.com, outlook.com, …) that carry no
 * brand signal of their own. A corporate email skips this entirely — see
 * `resolveSignupBrandDomain` in `brand-content.tsx`.
 */
export default function BrandWebsitePrompt({
  websiteUrl,
  submitting,
  errorMessage,
  onWebsiteUrlChange,
  onContinue,
  onSkip,
}: BrandWebsitePromptProps) {
  const translate = useTranslations('pages.onboarding.brand');

  return (
    <div>
      <h1 className="mb-4 text-4xl font-semibold leading-none tracking-tight text-foreground md:text-5xl text-balance">
        {translate('websitePrompt.title')}
      </h1>
      <p className="mb-8 max-w-lg text-lg text-muted-foreground">
        {translate('websitePrompt.description')}
      </p>

      <Form
        className="max-w-md"
        spacing="default"
        onSubmit={(event) => {
          event.preventDefault();
          onContinue();
        }}
      >
        <div>
          <label
            htmlFor="brand-website-url"
            className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2"
          >
            {translate('fields.website.label')}
            <span className="text-gray-800 font-normal normal-case tracking-normal ml-1">
              {translate('fields.optional')}
            </span>
          </label>
          <div className="relative">
            <Globe className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-gray-800" />
            <Input
              id="brand-website-url"
              type="text"
              inputMode="url"
              autoComplete="url"
              autoFocus
              value={websiteUrl}
              onChange={(e) => onWebsiteUrlChange(e.target.value)}
              placeholder={translate('fields.website.placeholder')}
              className="h-12 rounded-none border-border bg-background-tertiary px-4 pl-12 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-border-strong focus-visible:ring-0"
            />
          </div>
          <p className="text-xs text-gray-800 mt-1.5">
            {translate('fields.website.help')}
          </p>
        </div>

        <div hidden={!errorMessage}>
          {errorMessage ? (
            <Alert type={AlertCategory.ERROR}>
              <div className="space-y-1">
                <div className="font-medium">{translate('errors.title')}</div>
                <div className="text-xs text-foreground/70">{errorMessage}</div>
              </div>
            </Alert>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant={ButtonVariant.DEFAULT}
            size={ButtonSize.DEFAULT}
            label={translate('actions.continue')}
            icon={<ArrowRight className="size-4" />}
            isLoading={submitting}
            isDisabled={submitting}
            type="submit"
            className="rounded-none px-5"
          />
          <Button
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.DEFAULT}
            label={translate('actions.skip')}
            isDisabled={submitting}
            onClick={onSkip}
            className="rounded-none px-5"
          />
        </div>
      </Form>
    </div>
  );
}
