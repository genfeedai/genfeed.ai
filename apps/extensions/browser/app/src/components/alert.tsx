import type { ReactElement } from 'react';

type AlertVariant = 'error' | 'info' | 'success' | 'warning';

interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  description?: string;
}

const VARIANT_STYLES: Record<AlertVariant, string> = {
  error: 'border-destructive/50 text-destructive',
  info: 'border-info/50 text-info',
  success: 'border-success/50 text-success',
  warning: 'border-warning/50 text-warning',
};

export default function Alert({
  variant = 'error',
  title = 'Error',
  description = 'Please contact the developer',
}: AlertProps): ReactElement {
  return (
    <div
      role="alert"
      className={`relative w-full border bg-background px-4 py-3 text-sm mb-4 ${VARIANT_STYLES[variant]}`}
    >
      <h3 className="font-bold">{title}</h3>
      <div className="text-xs">{description}</div>
    </div>
  );
}
