import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
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
  /** Opt out of the press scale (pagination, segmented controls, toggles). */
  isStatic?: boolean;
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
  'inline-flex items-center gap-2 whitespace-nowrap text-left text-xs font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-200 ease-out cursor-pointer active:scale-[0.96] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    defaultVariants: {
      size: 'default',
      variant: 'default',
    },
    variants: {
      size: {
        // Icon-leading buttons pull the icon side in ~2px: the glyph's visual
        // mass sits inside its box, so equal padding reads as off-centre.
        default: 'h-8 px-3.5 py-1.5 has-[>svg:first-child]:pl-3',
        // 32px visual, 44px hit area via an invisible pseudo-element.
        icon: "relative h-8 w-8 justify-center after:absolute after:-inset-1.5 after:content-['']",
        lg: 'h-9 px-4 text-sm has-[>svg:first-child]:pl-3.5',
        // 28px visual, 40px hit area (dense desktop floor).
        micro:
          "relative size-7 justify-center p-0 after:absolute after:-inset-1.5 after:content-['']",
        sm: 'h-8 px-2.5 has-[>svg:first-child]:pl-2',
        xl: 'h-10 px-5 text-sm has-[>svg:first-child]:pl-4',
        xs: 'h-8 gap-1 px-2 has-[>svg:first-child]:pl-1.5',
      },
      variant: {
        default:
          'justify-center rounded-md bg-primary text-primary-foreground hover:bg-accent-hover shadow-border',
        destructive:
          'justify-center rounded-md bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/25',
        ghost:
          'rounded-md bg-transparent text-muted-foreground hover:bg-hover hover:text-foreground',
        link: 'justify-center text-foreground underline-offset-4 hover:underline active:scale-100',
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
  isStatic = false,
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
    isStatic && 'active:scale-100',
    className,
  );
};
