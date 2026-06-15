'use client';

interface NodeDescriptionProps {
  children: React.ReactNode;
}

/**
 * Standardized description text for workflow nodes
 */
export function NodeDescription({
  children,
}: NodeDescriptionProps): React.JSX.Element {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}
