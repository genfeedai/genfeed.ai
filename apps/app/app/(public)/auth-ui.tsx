import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { ArrowLeft, MailCheck } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Shared building blocks for the public auth surface (login / sign-up /
 * forgot-password / reset-password). Keeping the heading, divider, footer,
 * back-link, "check your email" state, and the button/link chrome in one place
 * stops the four screens from drifting apart and matches the reference auth
 * card design.
 */

/** Full-width primary submit action. */
export const AUTH_PRIMARY_BUTTON_CLASS_NAME =
  'h-10 w-full justify-center text-sm font-medium';

/** Full-width secondary / social / back action (outline). */
export const AUTH_SECONDARY_BUTTON_CLASS_NAME =
  'h-10 w-full justify-center gap-2 rounded-md border-border bg-background text-sm font-medium hover:bg-accent/50';

/** Inline accent link (sign-in / sign-up / forgot password). */
export const AUTH_LINK_CLASS_NAME =
  'font-medium text-info transition-colors hover:text-info/80';

interface AuthHeadingProps {
  description: string;
  title: string;
}

export function AuthHeading({ description, title }: AuthHeadingProps) {
  return (
    <div className="space-y-1">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">
        {title}
      </h1>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export function AuthDivider() {
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <span className="h-px flex-1 bg-border" />
      <span className="text-xs font-medium text-muted-foreground">or</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

export function AuthFooterPrompt({ children }: { children: ReactNode }) {
  return (
    <p className="text-center text-sm text-muted-foreground">{children}</p>
  );
}

interface AuthBackLinkProps {
  children: ReactNode;
  href: string;
}

export function AuthBackLink({ children, href }: AuthBackLinkProps) {
  return (
    <div className="text-center">
      <Link
        href={href}
        className="inline-flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {children}
      </Link>
    </div>
  );
}

interface AuthCheckEmailProps {
  backHref: string;
  backLabel: string;
  description: ReactNode;
  title: string;
}

export function AuthCheckEmail({
  backHref,
  backLabel,
  description,
  title,
}: AuthCheckEmailProps) {
  return (
    <div className="space-y-4 text-center">
      <MailCheck
        className="mx-auto size-8 text-muted-foreground"
        aria-hidden="true"
      />
      <h1 className="text-xl font-semibold tracking-tight text-foreground">
        {title}
      </h1>
      <p className="text-sm text-muted-foreground">{description}</p>
      <Button
        asChild
        variant={ButtonVariant.OUTLINE}
        className={AUTH_SECONDARY_BUTTON_CLASS_NAME}
        withWrapper={false}
      >
        <Link href={backHref}>{backLabel}</Link>
      </Button>
    </div>
  );
}
