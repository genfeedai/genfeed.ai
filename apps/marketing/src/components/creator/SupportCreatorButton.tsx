import { ButtonVariant } from '@genfeedai/contracts';
import { creatorSupportAppPath } from '@genfeedai/contracts/constants';
import type { SupportCreatorButtonProps } from '@props/content/creator.props';
import { EnvironmentService } from '@services/core/environment.service';
import ButtonTracked from '@web-components/buttons/tracked/ButtonTracked';
import { Coins } from 'lucide-react';

export function getSupportCreatorHref(
  handle: string,
  articleId?: string,
): string {
  return `${EnvironmentService.apps.app}${creatorSupportAppPath(handle, articleId)}`;
}

/**
 * Sends a signed-in reader to the app to support this creator in credits:
 * a paid subscription (#9717) or a tip (#9716). The app asks them to sign in
 * first when they are not.
 */
export default function SupportCreatorButton({
  articleId,
  className,
  handle,
}: SupportCreatorButtonProps): React.ReactElement {
  return (
    <ButtonTracked
      asChild
      className={className}
      variant={ButtonVariant.SECONDARY}
      withWrapper={false}
      trackingName="creator_support_click"
      trackingData={{
        action: articleId ? 'article_support' : 'profile_support',
        label: 'Support',
        profile: handle,
      }}
    >
      <a href={getSupportCreatorHref(handle, articleId)}>
        <Coins className="size-4" aria-hidden="true" />
        Support @{handle}
      </a>
    </ButtonTracked>
  );
}
