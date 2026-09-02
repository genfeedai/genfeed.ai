import { ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { MailCheck } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Shared building blocks for the public auth surface (login / sign-up /
 * forgot-password / reset-password). Keeping the heading, divider, footer,
 * action row, "check your email" state, and the button/link chrome in one
 * place stops the four screens from drifting apart and matches the reference
 * auth card design.
 */

/** Full-width primary submit action. */
export const AUTH_PRIMARY_BUTTON_CLASS_NAME =
  'h-10 w-full justify-center text-sm font-medium';

/** Full-width secondary / social / back action (outline). */
export const AUTH_SECONDARY_BUTTON_CLASS_NAME =
  'h-10 w-full justify-center gap-2 rounded-md border-border bg-background text-sm font-medium hover:bg-accent/50';

/** Inline accent link (sign-in / sign-up / forgot password). */
export const AUTH_LINK_CLASS_NAME =
  'font-medium text-foreground transition-colors hover:text-foreground/80';

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
  href: string;
}

export function AuthBackLink({ href }: AuthBackLinkProps) {
  return (
    <Button
      asChild
      variant={ButtonVariant.SECONDARY}
      className={AUTH_SECONDARY_BUTTON_CLASS_NAME}
      withWrapper={false}
    >
      <Link href={href}>
        <span>Back</span>
      </Link>
    </Button>
  );
}

interface AuthFormActionsProps {
  backHref: string;
  children: ReactNode;
}

export function AuthFormActions({ backHref, children }: AuthFormActionsProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <AuthBackLink href={backHref} />
      {children}
    </div>
  );
}

interface AuthCheckEmailProps {
  backHref: string;
}

export function AuthCheckEmail({ backHref }: AuthCheckEmailProps) {
  return (
    <div className="space-y-4 text-center">
      <MailCheck
        className="mx-auto size-8 text-muted-foreground"
        aria-hidden="true"
      />
      <AuthBackLink href={backHref} />
    </div>
  );
}
