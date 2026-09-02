import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers';
import { cva } from 'class-variance-authority';

export type ButtonVariantConfig = {
  nativeVariant: 'default' | 'secondary' | 'destructive' | 'ghost' | 'link';
};

export type CanonicalButtonVariant =
  | ButtonVariant.DEFAULT
  | ButtonVariant.DESTRUCTIVE
  | ButtonVariant.GHOST
  | ButtonVariant.LINK
  | ButtonVariant.SECONDARY
  | ButtonVariant.UNSTYLED;

export const BUTTON_VARIANT_CONFIG: Record<
  CanonicalButtonVariant,
  ButtonVariantConfig
> = {
  [ButtonVariant.DEFAULT]: { nativeVariant: 'default' },
  [ButtonVariant.DESTRUCTIVE]: { nativeVariant: 'destructive' },
  [ButtonVariant.GHOST]: { nativeVariant: 'ghost' },
  [ButtonVariant.LINK]: { nativeVariant: 'link' },
  [ButtonVariant.SECONDARY]: { nativeVariant: 'secondary' },
  [ButtonVariant.UNSTYLED]: { nativeVariant: 'default' },
};

export function resolveButtonVariant(
  variant?: ButtonVariant | null,
): CanonicalButtonVariant {
  if (!variant) {
    return ButtonVariant.DEFAULT;
  }

  const canonicalVariant = variant as CanonicalButtonVariant;
  return canonicalVariant in BUTTON_VARIANT_CONFIG
    ? canonicalVariant
    : ButtonVariant.DEFAULT;
}

export function getMappedButtonSize(size?: ButtonSize | null) {
  switch (size) {
    case ButtonSize.SM:
      return 'sm';
    case ButtonSize.LG:
      return 'lg';
    case ButtonSize.XS:
      return 'xs';
    case ButtonSize.MICRO:
      return 'micro';
    case ButtonSize.ICON:
      return 'icon';
    case ButtonSize.PUBLIC:
      return 'xl';
    default:
      return 'default';
  }
}

export function getSizeOverrideClassName(size?: ButtonSize | null) {
  if (size === ButtonSize.PUBLIC) {
    return 'h-10 px-5 text-sm uppercase tracking-[0.18em]';
  }

  return '';
}

export type ButtonStyleProps = {
  className?: string;
  size?: ButtonSize | null;
  variant?: ButtonVariant | null;
};

export const TEXT_TRANSFORM_CLASSES: Record<string, string> = {
  capitalize: 'capitalize',
  lowercase: 'lowercase',
  none: 'normal-case',
  uppercase: 'uppercase',
};

const nativeButtonVariants = cva(
  'inline-flex items-center gap-2 whitespace-nowrap text-left text-xs font-medium transition-colors cursor-pointer disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    defaultVariants: {
      size: 'default',
      variant: 'default',
    },
    variants: {
      size: {
        default: 'h-8 px-3.5 py-1.5',
        icon: 'h-8 w-8 justify-center',
        lg: 'h-9 px-4 text-sm',
        micro: 'size-7 justify-center p-0',
        sm: 'h-8 px-2.5',
        xl: 'h-10 px-5 text-sm',
        xs: 'h-8 gap-1 px-2',
      },
      variant: {
        default:
          'justify-center rounded-md bg-primary text-primary-foreground hover:bg-accent-hover shadow-border',
        destructive:
          'justify-center rounded-md bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/25',
        ghost:
          'rounded-md bg-transparent text-muted-foreground hover:bg-hover hover:text-foreground',
        link: 'justify-center text-foreground underline-offset-4 hover:underline',
        secondary:
          'justify-center rounded-md bg-tertiary text-foreground border border-border hover:bg-hover',
      },
    },
    compoundVariants: [
      {
        className: 'justify-start',
        size: ['default', 'lg', 'sm', 'xl', 'xs'],
        variant: 'ghost',
      },
    ],
  },
);

export const buttonVariants = ({
  className,
  size = ButtonSize.DEFAULT,
  variant = ButtonVariant.DEFAULT,
}: ButtonStyleProps = {}) => {
  const resolvedVariant = resolveButtonVariant(variant);

  if (resolvedVariant === ButtonVariant.UNSTYLED) {
    return className ?? '';
  }

  return cn(
    nativeButtonVariants({
      size: getMappedButtonSize(size),
      variant: BUTTON_VARIANT_CONFIG[resolvedVariant].nativeVariant,
    }),
    getSizeOverrideClassName(size),
    className,
  );
};
