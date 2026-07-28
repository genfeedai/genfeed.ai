import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { buttonVariants as shipButtonVariants } from '@shipshitdev/ui/primitives';
import { cn } from '../lib/utils';

export type ButtonVariantConfig = {
  shipVariant: 'default' | 'secondary' | 'destructive' | 'ghost' | 'link';
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
  [ButtonVariant.DEFAULT]: { shipVariant: 'default' },
  [ButtonVariant.DESTRUCTIVE]: { shipVariant: 'destructive' },
  [ButtonVariant.GHOST]: { shipVariant: 'ghost' },
  [ButtonVariant.LINK]: { shipVariant: 'link' },
  [ButtonVariant.SECONDARY]: { shipVariant: 'secondary' },
  [ButtonVariant.UNSTYLED]: { shipVariant: 'default' },
};

const LEGACY_BUTTON_VARIANT_ALIASES: Record<string, CanonicalButtonVariant> = {
  black: ButtonVariant.DEFAULT,
  generate: ButtonVariant.DEFAULT,
  outline: ButtonVariant.SECONDARY,
  'outline-white': ButtonVariant.SECONDARY,
  soft: ButtonVariant.SECONDARY,
  white: ButtonVariant.DEFAULT,
};

export function resolveButtonVariant(
  variant?: ButtonVariant | null,
): CanonicalButtonVariant {
  if (!variant) {
    return ButtonVariant.DEFAULT;
  }

  const canonicalVariant = variant as CanonicalButtonVariant;
  return (
    LEGACY_BUTTON_VARIANT_ALIASES[variant] ??
    (canonicalVariant in BUTTON_VARIANT_CONFIG
      ? canonicalVariant
      : ButtonVariant.DEFAULT)
  );
}

export function getMappedButtonSize(size?: ButtonSize | null) {
  switch (size) {
    case ButtonSize.SM:
      return 'sm';
    case ButtonSize.LG:
      return 'lg';
    case ButtonSize.XS:
      return 'xs';
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
    return 'h-10 px-5 text-[14px] uppercase tracking-[0.18em]';
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
    'ship-ui',
    shipButtonVariants({
      size: getMappedButtonSize(size),
      variant: BUTTON_VARIANT_CONFIG[resolvedVariant].shipVariant,
    }),
    getSizeOverrideClassName(size),
    className,
  );
};
