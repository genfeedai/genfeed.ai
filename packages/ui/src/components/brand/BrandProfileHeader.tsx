import { cn } from '@genfeedai/helpers';
import { BrandAvatar } from '@ui/primitives/brand-avatar';
import { BrandBanner } from '@ui/primitives/brand-banner';

export interface BrandProfileHeaderProps {
  /** Brand name: the picture alt text and the logo's initials. */
  label: string;
  bannerUrl?: string | null;
  logoUrl?: string | null;
  /** Responsive `sizes` hint for the banner picture. */
  bannerSizes?: string;
  className?: string;
}

/**
 * The banner with the logo tile overlapping its bottom edge, centered. One
 * header for the public profile and every page that previews a brand, so the
 * banner (X header ratio, 3:1) and the logo tile never drift apart. Without a
 * banner the logo sits alone; the content below clears the overlap itself via
 * `hasBrandProfileHeaderOverlap`.
 */
export default function BrandProfileHeader({
  bannerSizes,
  bannerUrl,
  className,
  label,
  logoUrl,
}: BrandProfileHeaderProps) {
  const hasBanner = Boolean(bannerUrl);

  return (
    <div
      className={cn('relative', className)}
      data-testid="brand-profile-header"
    >
      {hasBanner ? (
        <BrandBanner
          alt={`${label} banner`}
          isPriority
          shape="rounded"
          sizes={bannerSizes}
          src={bannerUrl}
        />
      ) : null}

      <div
        className={cn(
          'flex justify-center',
          hasBanner && 'absolute inset-x-0 -bottom-12',
        )}
      >
        <BrandAvatar
          alt={`${label} logo`}
          name={label}
          size="2xl"
          src={logoUrl}
        />
      </div>
    </div>
  );
}

/** Space the content under the header needs so the logo's overlap clears it. */
export function hasBrandProfileHeaderOverlap(
  bannerUrl?: string | null,
): boolean {
  return Boolean(bannerUrl);
}
