import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import CreatorArticleUnlockCard from './creator-article-unlock-card';
import CreatorSubscriptionCard from './creator-subscription-card';
import CreatorTipFlow from './creator-tip-flow';

export const generateMetadata = createPageMetadata('Support a creator');

/**
 * Support a creator (#9714): unlock the paid article the reader came from,
 * a paid subscription when offered, and tips.
 */
export default function CreatorSupportPage() {
  return (
    <div className="flex flex-col gap-4">
      <CreatorArticleUnlockCard />
      <CreatorSubscriptionCard />
      <CreatorTipFlow />
    </div>
  );
}
