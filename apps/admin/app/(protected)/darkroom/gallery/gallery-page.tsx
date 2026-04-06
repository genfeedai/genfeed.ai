'use client';

import ImageGrid from '@admin/(protected)/darkroom/_components/image-grid';
import ButtonRefresh from '@components/buttons/refresh/button-refresh/ButtonRefresh';
import { ButtonVariant } from '@genfeedai/enums';
import type { IDarkroomAsset, IDarkroomCharacter } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import { AdminDarkroomService } from '@services/admin/darkroom.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Button from '@ui/buttons/base/Button';
import CardEmpty from '@ui/card/empty/CardEmpty';
import Container from '@ui/layout/container/Container';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { useCallback, useEffect, useRef, useState } from 'react';
import { HiOutlinePhoto } from 'react-icons/hi2';

type ContentRating = 'all' | 'sfw' | 'nsfw';

const CONTENT_TABS: { key: ContentRating; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'sfw', label: 'SFW' },
  { key: 'nsfw', label: 'NSFW' },
];
const ALL_CHARACTERS_VALUE = '__all-characters__';

export default function GalleryPage() {
  const notificationsService = NotificationsService.getInstance();

  const getDarkroomService = useAuthedService((token: string) =>
    AdminDarkroomService.getInstance(token),
  );

  const [selectedCharacter, setSelectedCharacter] = useState<string>('');
  const [contentRating, setContentRating] = useState<ContentRating>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isActioning, setIsActioning] = useState(false);

  const { data: characters } = useResource<IDarkroomCharacter[]>(
    async () => {
      const service = await getDarkroomService();
      return service.getCharacters();
    },
    {
      onError: (error: unknown) => {
        logger.error('GET /admin/darkroom/characters failed', error);
      },
    },
  );

  const {
    data: assets,
    isLoading,
    isRefreshing,
    refresh,
  } = useResource<IDarkroomAsset[]>(
    async () => {
      const service = await getDarkroomService();
      const query: Record<string, string> = {};

      if (selectedCharacter) {
        query.personaSlug = selectedCharacter;
      }

      if (contentRating !== 'all') {
        query.contentRating = contentRating;
      }

      return service.getAssets(query);
    },
    {
      dependencies: [selectedCharacter, contentRating],
      onError: (error: unknown) => {
        logger.error('GET /admin/darkroom/assets failed', error);
      },
    },
  );

  // Refetch when filters change
  const isInitialMount = useRef(true);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    refresh();
  }, [refresh]);

  const handleDelete = useCallback(
    async (ids: string[]) => {
      setIsActioning(true);

      try {
        const service = await getDarkroomService();

        await Promise.all(ids.map((id) => service.reviewAsset(id, 'rejected')));

        notificationsService.success(`${ids.length} image(s) rejected`);
        setSelectedIds(new Set());
        refresh();
      } catch (error) {
        logger.error('Failed to reject assets', error);
        notificationsService.error('Failed to reject images');
      } finally {
        setIsActioning(false);
      }
    },
    [getDarkroomService, notificationsService, refresh],
  );

  const handleApprove = useCallback(
    async (ids: string[], target: string) => {
      setIsActioning(true);

      try {
        const service = await getDarkroomService();

        await Promise.all(ids.map((id) => service.reviewAsset(id, target)));

        notificationsService.success(`${ids.length} image(s) approved`);
        setSelectedIds(new Set());
        refresh();
      } catch (error) {
        logger.error('Failed to approve assets', error);
        notificationsService.error('Failed to approve images');
      } finally {
        setIsActioning(false);
      }
    },
    [getDarkroomService, notificationsService, refresh],
  );

  return (
    <Container
      label="Gallery"
      description="Review and manage generated darkroom assets"
      icon={HiOutlinePhoto}
      right={
        <ButtonRefresh onClick={() => refresh()} isRefreshing={isRefreshing} />
      }
    >
      {/* Filters Row */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
        {/* Character Selector */}
        <Select
          onValueChange={(value) => {
            setSelectedCharacter(value === ALL_CHARACTERS_VALUE ? '' : value);
            setSelectedIds(new Set());
          }}
          value={selectedCharacter || ALL_CHARACTERS_VALUE}
        >
          <SelectTrigger className="min-w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CHARACTERS_VALUE}>All Characters</SelectItem>
            {(characters || []).map((c) => (
              <SelectItem key={c.id} value={c.slug}>
                {c.emoji ? `${c.emoji} ` : ''}
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Content Rating Tabs */}
        <div className="flex gap-1 border border-foreground/10 rounded p-0.5">
          {CONTENT_TABS.map((tab) => (
            <Button
              key={tab.key}
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                contentRating === tab.key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-foreground/60 hover:text-foreground'
              }`}
              onClick={() => {
                setContentRating(tab.key);
                setSelectedIds(new Set());
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Image Grid */}
      {!isLoading && (!assets || assets.length === 0) ? (
        <CardEmpty label="No assets found" />
      ) : (
        <ImageGrid
          images={assets || []}
          isLoading={isLoading || isActioning}
          moveLabel="Approve"
          onDelete={handleDelete}
          onMove={handleApprove}
          onSelectionChange={setSelectedIds}
          selectedIds={selectedIds}
        />
      )}
    </Container>
  );
}
