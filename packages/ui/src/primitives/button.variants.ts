import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { buttonVariants as shipButtonVariants } from '@shipshitdev/ui/primitives';
import { cn } from '../lib/utils';

export type ButtonVariantConfig = {
  shipVariant:
    | 'default'
    | 'secondary'
    | 'destructive'
    | 'outline'
    | 'ghost'
    | 'link'
    | 'pill';
};

export const BUTTON_VARIANT_CONFIG: Record<ButtonVariant, ButtonVariantConfig> =
  {
    [ButtonVariant.BLACK]: { shipVariant: 'default' },
    [ButtonVariant.DEFAULT]: { shipVariant: 'default' },
    [ButtonVariant.DESTRUCTIVE]: { shipVariant: 'destructive' },
    [ButtonVariant.GENERATE]: { shipVariant: 'default' },
    [ButtonVariant.GHOST]: { shipVariant: 'ghost' },
    [ButtonVariant.LINK]: { shipVariant: 'link' },
    [ButtonVariant.OUTLINE]: { shipVariant: 'outline' },
    [ButtonVariant.OUTLINE_WHITE]: { shipVariant: 'outline' },
    [ButtonVariant.SECONDARY]: { shipVariant: 'secondary' },
    [ButtonVariant.SOFT]: { shipVariant: 'secondary' },
    [ButtonVariant.UNSTYLED]: { shipVariant: 'default' },
    [ButtonVariant.WHITE]: { shipVariant: 'default' },
  };

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
    case ButtonSize.DEFAULT:
    default:
      return 'default';
  }
}

export function getVariantOverrideClassName(variant?: ButtonVariant | null) {
  switch (variant) {
    case ButtonVariant.BLACK:
      return '!border-transparent !bg-black !text-white hover:!bg-black/90';
    case ButtonVariant.GENERATE:
      return '!border-transparent !bg-foreground !text-background hover:!bg-foreground/90';
    case ButtonVariant.OUTLINE_WHITE:
      return '!border-white/18 !bg-transparent !text-white hover:!bg-white/[0.04]';
    case ButtonVariant.SOFT:
      return '!border-transparent !bg-secondary !text-secondary-foreground hover:!bg-secondary/80';
    case ButtonVariant.WHITE:
      return '!border-transparent !bg-white !text-black hover:!bg-white/90';
    default:
      return '';
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
  const resolvedVariant = variant ?? ButtonVariant.DEFAULT;

  if (resolvedVariant === ButtonVariant.UNSTYLED) {
    return className ?? '';
  }

  return cn(
    'ship-ui',
    shipButtonVariants({
      size: getMappedButtonSize(size),
      variant: BUTTON_VARIANT_CONFIG[resolvedVariant].shipVariant,
    }),
    getVariantOverrideClassName(resolvedVariant),
    getSizeOverrideClassName(size),
    className,
  );
};
