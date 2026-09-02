'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import type { ReactElement, ReactNode } from 'react';

export type PromptBarNoticeTone = 'warning' | 'destructive' | 'info';

export interface PromptBarNoticeProps {
  ctaHref: string;
  ctaLabel: string;
  description: ReactNode;
  title: string;
  tone?: PromptBarNoticeTone;
}

const TONE_CLASSES: Record<
  PromptBarNoticeTone,
  { iconWrap: string; root: string }
> = {
  destructive: {
    iconWrap: 'border-destructive/30 bg-destructive/15 text-destructive',
    root: 'bg-destructive/10 text-foreground',
  },
  info: {
    iconWrap: 'border-info/30 bg-info/15 text-info',
    root: 'bg-info/10 text-foreground',
  },
  warning: {
    iconWrap: 'border-warning/30 bg-warning/15 text-warning',
    root: 'bg-warning/10 text-foreground',
  },
};

/**
 * Compact in-bar notice for generate/chat gates.
 * Lives inside PromptBarShell — not a floating page alert.
 */
export default function PromptBarNotice({
  ctaHref,
  ctaLabel,
  description,
  title,
  tone = 'warning',
}: PromptBarNoticeProps): ReactElement {
  const toneClasses = TONE_CLASSES[tone];

  return (
    <div
      className={cn(
        'flex items-center gap-2.5 px-3 py-2.5 sm:gap-3 sm:px-3.5',
        toneClasses.root,
      )}
      data-testid="prompt-bar-notice"
      role="alert"
    >
      <div
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-lg border',
          toneClasses.iconWrap,
        )}
      >
        <TriangleAlert aria-hidden="true" className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold leading-4 text-foreground">
          {title}
        </p>
        <p className="mt-0.5 truncate text-2xs leading-4 text-foreground/60">
          {description}
        </p>
      </div>
      <Button
        asChild
        className="h-8 shrink-0 px-2.5 text-xs"
        size={ButtonSize.SM}
        variant={ButtonVariant.SECONDARY}
        withWrapper={false}
      >
        <Link href={ctaHref}>{ctaLabel}</Link>
      </Button>
    </div>
  );
}
