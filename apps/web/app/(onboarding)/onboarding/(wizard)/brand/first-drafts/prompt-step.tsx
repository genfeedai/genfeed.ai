'use client';
import { ButtonSize, ButtonVariant, CardPadding } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url/use-org-url';
import { logger } from '@services/core/logger.service';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { Pre } from '@ui/primitives/pre';
import { Clipboard } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { FirstDraftsPromptProps } from '@/features/onboarding/props/first-drafts.props';
import { useOnboardingCreditBalance } from './use-onboarding-credit-balance';

export default function PromptStep({
  brandName,
  client,
}: FirstDraftsPromptProps) {
  const t = useTranslations('pages.onboarding.firstDrafts');
  const { orgHref } = useOrgUrl();
  const { balance, isLoading } = useOnboardingCreditBalance();
  const [isCopied, setIsCopied] = useState(false);
  const [hasCopyFailed, setHasCopyFailed] = useState(false);
  // The Claude connector drafts and schedules but has no image tools, so its
  // prompt never asks for media.
  const prompt = t(
    client === 'claude-code' ? 'prompt.textDrafts' : 'prompt.textWithImages',
    { brand: brandName },
  );

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setIsCopied(true);
      setHasCopyFailed(false);
    } catch (error) {
      logger.error('Failed to copy the first prompt', error);
      setHasCopyFailed(true);
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{t('prompt.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('prompt.description', {
            client: t(`agent.clients.${client}.label`),
          })}
        </p>
      </div>
      <Pre>
        <code>{prompt}</code>
      </Pre>
      <div>
        <Button
          icon={<Clipboard aria-hidden="true" className="size-4" />}
          onClick={() => void copyPrompt()}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
        >
          {isCopied ? t('agent.copied') : t('prompt.copy')}
        </Button>
      </div>
      {hasCopyFailed && (
        <p role="alert" className="text-sm text-destructive">
          {t('agent.copyFailed')}
        </p>
      )}
      <Card label={t('prompt.credits.label')} padding={CardPadding.MD}>
        <p className="text-sm font-medium" role="status">
          {isLoading
            ? '…'
            : balance === null
              ? t('prompt.credits.unavailable')
              : t('prompt.credits.balance', { count: balance })}
        </p>
        {balance === 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted-foreground">
              {t('prompt.credits.empty')}
            </p>
            <Button
              asChild
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
              withWrapper={false}
            >
              <Link href={orgHref(APP_ROUTES.SETTINGS.CREDITS)}>
                {t('prompt.credits.topUp')}
              </Link>
            </Button>
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          {t('prompt.credits.note')}
        </p>
      </Card>
    </section>
  );
}
