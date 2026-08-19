import type { ReactElement, ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps): ReactElement {
  return (
    <div className="text-center py-8">
      {icon && <div className="mx-auto mb-4">{icon}</div>}
      <h3 className="mb-2 text-lg font-medium text-foreground">{title}</h3>
      {description && (
        <p className="mb-4 text-sm text-muted-foreground">{description}</p>
      )}
      {action}
    </div>
  );
}
