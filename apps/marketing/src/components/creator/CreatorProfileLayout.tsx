import { creatorProfilePath } from '@genfeedai/contracts/constants';
import type { CreatorProfileLayoutProps } from '@props/content/creator.props';
import { EnvironmentService } from '@services/core/environment.service';
import { BrandBanner } from '@ui/primitives/brand-banner';
import CreatorRail from './CreatorRail';
import CreatorTabs from './CreatorTabs';

/**
 * The creator showcase: their banner across the top, then a sticky rail about
 * the creator beside a grid of their public work. On small screens the rail
 * stacks above the grid.
 */
export default function CreatorProfileLayout({
  active,
  brand,
  children,
  counts,
  handle,
  referralCode,
}: CreatorProfileLayoutProps): React.ReactElement {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 pb-16 pt-10 lg:px-6">
      {brand.bannerUrl ? (
        <BrandBanner
          alt={`${brand.label?.trim() || `@${handle}`} banner`}
          isPriority
          shape="rounded"
          sizes="(min-width: 1280px) 1232px, 100vw"
          src={brand.bannerUrl}
        />
      ) : null}
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <CreatorRail
            brand={brand}
            counts={counts}
            handle={handle}
            profileUrl={`${EnvironmentService.apps.website}${creatorProfilePath(handle)}`}
            referralCode={referralCode}
          />
        </aside>
        <div className="min-w-0 space-y-8">
          <CreatorTabs active={active} counts={counts} handle={handle} />
          {children}
        </div>
      </div>
    </div>
  );
}
