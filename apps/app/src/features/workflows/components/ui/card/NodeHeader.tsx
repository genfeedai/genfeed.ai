'use client';

interface NodeHeaderProps {
  icon?: React.ReactNode;
  title: string;
  badge?: React.ReactNode;
}

/**
 * Standardized header for workflow nodes
 */
export function NodeHeader({
  icon,
  title,
  badge,
}: NodeHeaderProps): React.JSX.Element {
  return (
    <div className="flex items-center justify-between">
      <h3 className="font-semibold text-sm flex items-center gap-2">
        {icon}
        {title}
      </h3>
      {badge}
    </div>
  );
}
