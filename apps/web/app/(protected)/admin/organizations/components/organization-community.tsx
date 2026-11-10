'use client';

import { useConfirmModal } from '@genfeedai/contexts/providers/global-modals/global-modals.hooks';
import { ButtonSize, ButtonVariant, CardPadding } from '@genfeedai/contracts';
import {
  ADMIN_COMMUNITY_MEDIA_PAGE_SIZE,
  creatorProfilePath,
} from '@genfeedai/contracts/constants';
import type {
  IAdminCommunityCreator,
  IAdminCommunityMedia,
} from '@genfeedai/contracts/interfaces';
import type { AdminCommunityTarget } from '@services/admin/community.service';
import { EnvironmentService } from '@services/core/environment.service';
import { NotificationsService } from '@services/core/notifications.service';
import Card from '@ui/card/Card';
import CollectionSection from '@ui/collection/CollectionSection';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import ListRow from '@ui/lists/list-row/ListRow';
import Pagination from '@ui/navigation/pagination/Pagination';
import { Alert, AlertActions, AlertDescription } from '@ui/primitives/alert';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { EmptyState } from '@ui/primitives/empty-state';
import { ImageIcon } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import type {
  OrganizationCommunityAction,
  OrganizationCommunityMediaPreviewProps,
  OrganizationCommunityProps,
} from '@/features/admin/props/organization-community.props';
import { useOrganizationCommunity } from '../hooks/use-organization-community';

const PREVIEW_SIZE = 64;

function MediaPreview({ media }: OrganizationCommunityMediaPreviewProps) {
  if (!media.url) {
    return (
      <div className="flex size-16 shrink-0 items-center justify-center rounded-md bg-tertiary">
        <ImageIcon className="size-5 text-muted-foreground" />
      </div>
    );
  }
  return (
    <div className="size-16 shrink-0 overflow-hidden rounded-md bg-tertiary">
      {media.kind === 'image' ? (
        <Image
          alt={media.label}
          className="size-full object-cover"
          height={PREVIEW_SIZE}
          src={media.url}
          unoptimized
          width={PREVIEW_SIZE}
        />
      ) : (
        <VideoPlayer
          ariaLabel={media.label}
          className="size-full"
          config={{
            controls: false,
            loop: false,
            muted: true,
            playsInline: true,
            preload: 'metadata',
          }}
          src={media.url}
        />
      )}
    </div>
  );
}

/**
 * What one organization shows on genfeed.ai/community: its public creators and
 * its public images and videos. An operator features one, stops featuring it,
 * or takes it off community (it moves back to the organization). Backs the
 * organization page's Community tab.
 */
export default function OrganizationCommunity({
  organizationId,
}: OrganizationCommunityProps) {
  const translate = useTranslations('pages.adminOrganizations.community');
  const { openConfirm } = useConfirmModal();
  const [page, setPage] = useState(1);
  const { apply, data, isError, isLoading, isSaving, refetch } =
    useOrganizationCommunity(organizationId, page);
  const mediaTotal = data?.mediaTotal ?? 0;
  const lastPage = Math.max(
    1,
    Math.ceil(mediaTotal / ADMIN_COMMUNITY_MEDIA_PAGE_SIZE),
  );

  // Taking the last item of the last page off community leaves that page
  // empty: step back to the page that is now last, which loads it.
  useEffect(() => {
    if (data && page > lastPage) {
      setPage(lastPage);
    }
  }, [data, lastPage, page]);

  async function run(action: OrganizationCommunityAction, success: string) {
    const notifications = NotificationsService.getInstance();
    try {
      await apply(action);
      notifications.success(success);
    } catch {
      notifications.error(translate('saveError'));
    }
  }

  function feature(
    target: AdminCommunityTarget,
    id: string,
    isFeatured: boolean,
  ) {
    void run(
      { id, isFeatured, kind: 'feature', target },
      translate(isFeatured ? 'featured' : 'unfeatured'),
    );
  }

  function unpublish(target: AdminCommunityTarget, id: string, name: string) {
    openConfirm({
      confirmLabel: translate('unpublish'),
      isError: true,
      label: translate(
        target === 'creators' ? 'unpublishCreatorTitle' : 'unpublishMediaTitle',
      ),
      message: translate(
        target === 'creators'
          ? 'unpublishCreatorMessage'
          : 'unpublishMediaMessage',
        { name },
      ),
      onConfirm: () =>
        void run({ id, kind: 'unpublish', target }, translate('unpublished')),
    });
  }

  function renderActions(
    target: AdminCommunityTarget,
    item: { id: string; isFeatured: boolean },
    name: string,
  ) {
    return (
      <div className="flex items-center gap-2">
        <Button
          ariaLabel={translate(
            item.isFeatured ? 'unfeatureNamed' : 'featureNamed',
            {
              name,
            },
          )}
          isDisabled={isSaving}
          label={translate(item.isFeatured ? 'unfeature' : 'feature')}
          onClick={() => feature(target, item.id, !item.isFeatured)}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
        />
        <Button
          ariaLabel={translate('unpublishNamed', { name })}
          isDisabled={isSaving}
          label={translate('unpublish')}
          onClick={() => unpublish(target, item.id, name)}
          size={ButtonSize.SM}
          variant={ButtonVariant.GHOST}
        />
      </div>
    );
  }

  function renderCreator(creator: IAdminCommunityCreator) {
    const profileUrl = `${EnvironmentService.apps.website}${creatorProfilePath(creator.handle)}`;
    return (
      <ListRow
        key={creator.id}
        density="compact"
        title={creator.label}
        description={
          <Link href={profileUrl} rel="noopener noreferrer" target="_blank">
            {`genfeed.ai${creatorProfilePath(creator.handle)}`}
          </Link>
        }
        meta={
          <span className="flex flex-wrap items-center gap-2">
            {creator.isFeatured ? (
              <Badge variant="info">{translate('featuredBadge')}</Badge>
            ) : null}
            <ClientFormattedDate value={creator.createdAt} />
          </span>
        }
        trailing={renderActions('creators', creator, creator.label)}
      />
    );
  }

  function renderMedia(media: IAdminCommunityMedia) {
    const name = media.label || translate(`kinds.${media.kind}`);
    return (
      <ListRow
        key={media.id}
        density="compact"
        leading={<MediaPreview media={media} />}
        title={name}
        meta={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              {translate(`kinds.${media.kind}`)}
            </Badge>
            {media.isFeatured ? (
              <Badge variant="info">{translate('featuredBadge')}</Badge>
            ) : null}
            <ClientFormattedDate value={media.createdAt} />
          </span>
        }
        trailing={renderActions('media', media, name)}
      />
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{translate('loadError')}</AlertDescription>
        <AlertActions>
          <Button
            label={translate('retry')}
            onClick={() => void refetch()}
            variant={ButtonVariant.SECONDARY}
          />
        </AlertActions>
      </Alert>
    );
  }

  const creators = data?.creators ?? [];
  const media = data?.media ?? [];

  if (!isLoading && creators.length === 0 && mediaTotal === 0) {
    return (
      <EmptyState
        title={translate('empty')}
        description={translate('emptyDescription')}
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <CollectionSection
        title={translate('creatorsTitle')}
        description={translate('creatorsDescription')}
        itemCount={creators.length}
        isCountVisible
        isLoading={isLoading}
      >
        <Card padding={CardPadding.NONE}>{creators.map(renderCreator)}</Card>
      </CollectionSection>
      <CollectionSection
        title={translate('mediaTitle')}
        description={translate('mediaDescription')}
        itemCount={mediaTotal}
        isCountVisible
        isLoading={isLoading}
      >
        <Card padding={CardPadding.NONE}>{media.map(renderMedia)}</Card>
        <Pagination
          currentPage={page}
          onPageChange={setPage}
          totalItems={mediaTotal}
          totalPages={lastPage}
        />
      </CollectionSection>
    </div>
  );
}
