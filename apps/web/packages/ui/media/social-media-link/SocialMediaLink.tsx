import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { getDeepLink, isMobileDevice } from '@helpers/ui/mobile/mobile.helper';
import { addUTMParameters } from '@helpers/utm/utm-builder.helper';
import type { SocialMediaLinkProps } from '@props/social/social-media-link.props';
import { SimpleTooltip } from '@ui/primitives/tooltip';
import Link from 'next/link';

const variantStyles: Partial<Record<ButtonVariant, string>> = {
  [ButtonVariant.DEFAULT]:
    'bg-primary text-primary-foreground hover:bg-primary/90',
  [ButtonVariant.GHOST]: 'hover:bg-accent hover:text-accent-foreground',
  [ButtonVariant.LINK]: 'text-primary underline-offset-4 hover:underline',
  [ButtonVariant.OUTLINE]:
    'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
  [ButtonVariant.SECONDARY]:
    'bg-secondary text-secondary-foreground hover:bg-secondary/80',
};

const sizeStyles: Partial<Record<ButtonSize, string>> = {
  [ButtonSize.DEFAULT]: 'h-9 px-4 py-2',
  [ButtonSize.LG]: 'h-10 px-8',
  [ButtonSize.SM]: 'h-8 px-3 text-xs',
};

export default function SocialMediaLink({
  url,
  handle,
  icon,
  className,
  tooltipPosition = 'bottom',
  username,
  enableUTM = true,
  variant = ButtonVariant.SECONDARY,
  size = ButtonSize.DEFAULT,
}: SocialMediaLinkProps) {
  const isMobile = isMobileDevice();

  // Apply UTM tracking if username is provided and UTM is enabled
  let finalUrl = url;
  if (enableUTM && username) {
    finalUrl = addUTMParameters(url, username);
  }

  const buttonClass =
    className ??
    `btn w-full ${variant ? (variantStyles[variant] ?? '') : ''} ${size ? (sizeStyles[size] ?? '') : ''}`.trim();

  return (
    <div className="self-end">
      {handle ? (
        <SimpleTooltip label={`@${handle}`} position={tooltipPosition}>
          <Link
            href={getDeepLink(finalUrl, isMobile)}
            className={buttonClass}
            target="_blank"
          >
            {icon}
          </Link>
        </SimpleTooltip>
      ) : (
        <Link
          href={getDeepLink(finalUrl, isMobile)}
          className={buttonClass}
          target="_blank"
        >
          {icon}
        </Link>
      )}
    </div>
  );
}
