import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

export interface NotFoundStateProps
  extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  title: string;
  message?: string;
  /** The action is a link to this address. */
  backLinkHref?: string;
  /** The action is a button that calls this instead of a link. */
  onBack?: () => void;
  /** Label of the action. */
  backLinkLabel?: string;
  /**
   * `region` is the state inside a page or panel (a missing project, a missing
   * thread). `hero` is the standalone 404 route, which is led by `visual`.
   */
  size?: 'region' | 'hero';
  /** Artwork above the title; the 404 route draws its orbit here. */
  visual?: ReactNode;
}

const ROOT_CLASS = {
  hero: 'flex flex-col items-center gap-5 px-4 py-10 text-center',
  region:
    'flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-6 text-center',
} as const;

const TITLE_CLASS = {
  hero: 'text-3xl font-semibold tracking-tight text-balance md:text-4xl',
  region: 'text-lg font-semibold text-foreground',
} as const;

const MESSAGE_CLASS = {
  hero: 'max-w-[44ch] text-pretty text-foreground/70',
  region: 'text-sm text-muted-foreground',
} as const;

/**
 * The one "this does not exist" state: a title, what happened, and a way out.
 * Pages and panels render it with their own words and action; none builds its
 * own. The action is a link (`backLinkHref`), a button (`onBack`), or absent.
 */
export default function NotFoundState({
  title,
  message,
  backLinkHref,
  backLinkLabel = 'Back to Home',
  onBack,
  size = 'region',
  visual,
  className,
  ...rest
}: NotFoundStateProps) {
  const isHero = size === 'hero';
  const buttonProps = isHero
    ? { size: ButtonSize.DEFAULT, variant: ButtonVariant.DEFAULT }
    : { size: ButtonSize.SM, variant: ButtonVariant.SECONDARY };
  const Heading = isHero ? 'h1' : 'h2';

  return (
    <div className={cn(ROOT_CLASS[size], className)} {...rest}>
      {visual}
      <div className={cn('space-y-1', isHero && 'space-y-5')}>
        <Heading className={TITLE_CLASS[size]}>{title}</Heading>
        {message ? <p className={MESSAGE_CLASS[size]}>{message}</p> : null}
      </div>
      {onBack ? (
        <Button {...buttonProps} onClick={onBack} withWrapper={false}>
          {backLinkLabel}
        </Button>
      ) : backLinkHref ? (
        <Button {...buttonProps} asChild withWrapper={false}>
          <Link href={backLinkHref}>{backLinkLabel}</Link>
        </Button>
      ) : null}
    </div>
  );
}
