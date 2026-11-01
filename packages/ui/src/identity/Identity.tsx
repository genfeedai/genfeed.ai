import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { Avatar } from '@ui/primitives/avatar';

type IdentitySize = 'xs' | 'sm' | 'default' | 'lg';

interface IdentityProps {
  name: string;
  /** Picture URL; initials show until it loads or when there is none. */
  src?: string | null;
  size?: IdentitySize;
  className?: string;
}

const avatarSize = {
  default: 'sm',
  lg: 'md',
  sm: 'xs',
  xs: '2xs',
} as const;

const textSize: Record<IdentitySize, string> = {
  default: 'text-sm',
  lg: 'text-sm',
  sm: 'text-xs',
  xs: 'text-sm',
};

/** A person's avatar beside their name, inline with text. */
export function Identity({
  name,
  src,
  size = 'default',
  className,
}: IdentityProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5',
        size === 'xs' && 'items-baseline gap-1',
        size === 'lg' && 'gap-2',
        className,
      )}
    >
      <Avatar
        className={cn(size === 'xs' && 'relative -top-px')}
        name={name}
        size={avatarSize[size]}
        src={src}
      />
      <span className={cn('truncate', textSize[size])}>{name}</span>
    </span>
  );
}
