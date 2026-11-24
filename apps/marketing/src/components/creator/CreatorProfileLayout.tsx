import { creatorProfilePath } from '@genfeedai/contracts/constants';
import type { CreatorProfileLayoutProps } from '@props/content/creator.props';
import { EnvironmentService } from '@services/core/environment.service';
import { BrandBanner } from '@ui/primitives/brand-banner';
import CreatorHeader from './CreatorHeader';
import CreatorTabs from './CreatorTabs';

/**
 * The creator showcase: the banner across the top, the creator's header
 * overlapping it, then the tabs and their content on one column.
 */
export default function CreatorProfileLayout({
  active,
  brand,
  children,
  counts,
  handle,
  reach,
}: CreatorProfileLayoutProps): React.ReactElement {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 pb-16 pt-6 lg:px-6">
      {brand.bannerUrl ? (
        <BrandBanner
          alt={`${brand.label?.trim() || `@${handle}`} banner`}
          className="sm:max-h-72"
          isPriority
          shape="rounded"
          sizes="(min-width: 1280px) 1152px, 100vw"
          src={brand.bannerUrl}
        />
      ) : null}
      <CreatorHeader
        brand={brand}
        handle={handle}
        hasBanner={Boolean(brand.bannerUrl)}
        profileUrl={`${EnvironmentService.apps.website}${creatorProfilePath(handle)}`}
        reach={reach}
      />
      <CreatorTabs active={active} counts={counts} handle={handle} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
