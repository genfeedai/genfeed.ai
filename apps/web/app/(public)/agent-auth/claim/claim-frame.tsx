'use client';

import { CardGap, CardPadding } from '@genfeedai/contracts';
import Card from '@ui/card/Card';
import { KeyRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import AuthFormLayout from '@/components/layouts/auth/AuthFormLayout';

/**
 * The claim page's own frame: logo, heading, card and footer. The loaded page
 * and the prerendered fallback share it, so the content swaps in without the
 * page moving (#10886).
 */
export default function AgentAuthClaimFrame({
  children,
}: {
  children?: ReactNode;
}) {
  const translate = useTranslations('common.agentAuth.claim');

  return (
    <AuthFormLayout>
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-5 inline-flex size-12 items-center justify-center rounded-xl border border-border bg-tertiary">
            <KeyRound
              className="size-5 text-muted-foreground"
              aria-hidden="true"
            />
          </div>
          <h1 className="mb-1.5 text-xl font-semibold tracking-tight text-balance">
            {translate('title')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {translate('description')}
          </p>
        </div>

        <Card padding={CardPadding.XL} gap={CardGap.LG}>
          {children}
        </Card>

        <p className="mt-5 text-center text-2xs leading-relaxed text-muted-foreground/50">
          {translate('footer')}
        </p>
      </div>
    </AuthFormLayout>
  );
}
