function cn(...classes: (string | false | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

type IdentitySize = 'xs' | 'sm' | 'default' | 'lg';

interface IdentityProps {
  name: string;
  initials?: string;
  size?: IdentitySize;
  className?: string;
}

function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2)
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const avatarSize: Record<IdentitySize, string> = {
  default: 'h-6 w-6 text-[10px]',
  lg: 'h-7 w-7 text-xs',
  sm: 'h-5 w-5 text-[9px]',
  xs: 'h-4 w-4 text-[8px]',
};

const textSize: Record<IdentitySize, string> = {
  default: 'text-sm',
  lg: 'text-sm',
  sm: 'text-xs',
  xs: 'text-sm',
};

export function Identity({
  name,
  initials,
  size = 'default',
  className,
}: IdentityProps) {
  const displayInitials = initials ?? deriveInitials(name);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5',
        size === 'xs' && 'items-baseline gap-1',
        size === 'lg' && 'gap-2',
        className,
      )}
    >
      <span
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-full bg-muted font-medium text-muted-foreground',
          avatarSize[size],
          size === 'xs' && 'relative -top-px',
        )}
      >
        {displayInitials}
      </span>
      <span className={cn('truncate', textSize[size])}>{name}</span>
    </span>
  );
}
