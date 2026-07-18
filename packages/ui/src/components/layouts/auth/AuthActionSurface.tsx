import type { AuthActionSurfaceProps } from '@genfeedai/props/layout/auth-action-surface.props';
import { cn } from '@ui/lib/utils';

/**
 * Host-agnostic auth chooser presentation.
 *
 * Hosts own authentication behavior and inject only the actions they support.
 * This keeps browser-session forms out of native clients while preserving the
 * same Genfeed auth hierarchy across SaaS and Desktop.
 */
export default function AuthActionSurface({
  actions,
  className,
  description,
  error,
  footer,
  supportingCopy,
  title,
}: AuthActionSurfaceProps) {
  return (
    <div
      className={cn('auth-action-surface w-full space-y-6', className)}
      data-testid="auth-action-surface"
    >
      <div className="auth-action-heading space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      {error ? (
        <div
          aria-live="polite"
          className="auth-action-error text-sm text-destructive"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <div className="auth-action-list space-y-3">{actions}</div>

      {supportingCopy ? (
        <div className="auth-action-support text-sm text-muted-foreground">
          {supportingCopy}
        </div>
      ) : null}

      {footer ? <div className="auth-action-footer">{footer}</div> : null}
    </div>
  );
}
