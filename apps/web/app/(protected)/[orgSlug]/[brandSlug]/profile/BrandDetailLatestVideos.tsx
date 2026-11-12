import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { BrandDetailLatestVideosProps } from '@props/pages/brand-detail.props';
import { EnvironmentService } from '@services/core/environment.service';
import { LazyMasonryVideo } from '@ui/lazy/masonry/LazyMasonry';
import Link from 'next/link';
import { useIsAppAvailable } from '@/components/shell/use-available-rail-apps';
import BrandDetailLatestContentCard from './BrandDetailLatestContentCard';

export default function BrandDetailLatestVideos({
  videos,
}: BrandDetailLatestVideosProps) {
  const { href } = useOrgUrl();
  // One-off generation is Agent-first — Studio no longer has a media prompt bar.
  const isAgentAvailable = useIsAppAvailable('agent');
  const createHref = isAgentAvailable
    ? `${EnvironmentService.apps.app}${href(APP_ROUTES.AGENT.NEW)}`
    : undefined;

  return (
    <BrandDetailLatestContentCard
      label="Latest Videos"
      viewAllLink={
        <Link
          href={`${EnvironmentService.apps.app}${href(APP_ROUTES.LIBRARY.ASSETS)}`}
        >
          View all
        </Link>
      }
      emptyTitle="No videos yet"
      createLabel="Create a video"
      createHref={createHref}
    >
      {videos && videos.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {videos.map((video) => (
            <LazyMasonryVideo
              key={video.id}
              video={video}
              isActionsEnabled={false}
              isPublicGallery={false}
            />
          ))}
        </div>
      ) : null}
    </BrandDetailLatestContentCard>
  );
}
