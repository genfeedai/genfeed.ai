'use client';

import DatasetUploader from '@admin/(protected)/darkroom/_components/dataset-uploader';
import ImageGrid from '@admin/(protected)/darkroom/_components/image-grid';
import type { IDarkroomAsset, IDarkroomCharacter } from '@genfeedai/interfaces';
import ButtonRefresh from '@components/buttons/refresh/button-refresh/ButtonRefresh';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import { AdminDarkroomService } from '@services/admin/darkroom.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Badge from '@ui/display/badge/Badge';
import Container from '@ui/layout/container/Container';
import AppLink from '@ui/navigation/link/Link';
import Tabs from '@ui/navigation/tabs/Tabs';
import { useCallback, useMemo, useState } from 'react';
import { HiArrowLeft, HiOutlineUserCircle } from 'react-icons/hi2';

type ReviewTab = 'selected' | 'review' | 'trash';

const TABS: { key: ReviewTab; label: string; status: string }[] = [
  { key: 'selected', label: 'Selected', status: 'approved' },
  { key: 'review', label: 'Review', status: 'pending' },
  { key: 'trash', label: 'Trash', status: 'rejected' },
];

const LORA_STATUS_COLORS = {
  completed: 'bg-success/10 text-success',
  failed: 'bg-error/10 text-error',
  pending: 'bg-warning/10 text-warning',
  training: 'bg-info/10 text-info',
} as const;

interface CharacterDetailProps {
  slug: string;
}

type DarkroomCharacterRecord = IDarkroomCharacter & {
  loraModelPath?: string;
  loraStatus?: string;
};

export default function CharacterDetail({ slug }: CharacterDetailProps) {
  const notificationsService = NotificationsService.getInstance();

  const getDarkroomService = useAuthedService((token: string) =>
    AdminDarkroomService.getInstance(token),
  );

  const [activeTab, setActiveTab] = useState<ReviewTab>('selected');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isActioning, setIsActioning] = useState(false);

  const {
    data: character,
    isLoading: isLoadingCharacter,
    refresh: refreshCharacter,
  } = useResource<DarkroomCharacterRecord>(
    async () => {
      const service = await getDarkroomService();
      return service.getCharacter(slug) as Promise<DarkroomCharacterRecord>;
    },
    {
      onError: (error: unknown) => {
        logger.error(`GET /admin/darkroom/characters/${slug} failed`, error);
      },
    },
  );

  const {
    data: assets,
    isLoading: isLoadingAssets,
    refresh: refreshAssets,
    isRefreshing,
  } = useResource<IDarkroomAsset[]>(
    async () => {
      const service = await getDarkroomService();
      return service.getAssets({ personaSlug: slug });
    },
    {
      onError: (error: unknown) => {
        logger.error(
          `GET /admin/darkroom/assets?personaSlug=${slug} failed`,
          error,
        );
      },
    },
  );

  const activeStatus =
    TABS.find((t) => t.key === activeTab)?.status ?? 'approved';

  const filteredAssets = useMemo(
    () => (assets || []).filter((a) => a.reviewStatus === activeStatus),
    [assets, activeStatus],
  );

  const handleDelete = useCallback(
    async (ids: string[]) => {
      setIsActioning(true);

      try {
        const service = await getDarkroomService();

        await Promise.all(ids.map((id) => service.reviewAsset(id, 'rejected')));

        notificationsService.success(`${ids.length} image(s) moved to trash`);
        setSelectedIds(new Set());
        refreshAssets();
      } catch (error) {
        logger.error('Failed to reject assets', error);
        notificationsService.error('Failed to move images to trash');
      } finally {
        setIsActioning(false);
      }
    },
    [getDarkroomService, notificationsService, refreshAssets],
  );

  const handleMove = useCallback(
    async (ids: string[], target: string) => {
      setIsActioning(true);

      try {
        const service = await getDarkroomService();

        await Promise.all(ids.map((id) => service.reviewAsset(id, target)));

        notificationsService.success(`${ids.length} image(s) approved`);
        setSelectedIds(new Set());
        refreshAssets();
      } catch (error) {
        logger.error('Failed to approve assets', error);
        notificationsService.error('Failed to approve images');
      } finally {
        setIsActioning(false);
      }
    },
    [getDarkroomService, notificationsService, refreshAssets],
  );

  const isLoading = isLoadingCharacter || isLoadingAssets;

  return (
    <Container
      label={
        <div className="flex items-center gap-3">
          <AppLink
            url="/darkroom/characters"
            icon={
              <HiArrowLeft className="w-5 h-5 text-foreground/60 hover:text-foreground transition-colors" />
            }
          />

          {character ? (
            <>
              {character.emoji && (
                <span className="text-2xl">{character.emoji}</span>
              )}
              {character.label}
            </>
          ) : (
            slug
          )}
        </div>
      }
      description={
        character?.niche ||
        'Character profile, LoRA status, and generated content'
      }
      icon={HiOutlineUserCircle}
      right={
        <ButtonRefresh
          onClick={() => refreshAssets()}
          isRefreshing={isRefreshing}
        />
      }
    >
      {/* Character Info Header */}
      {character && !isLoadingCharacter && (
        <div className="flex items-start gap-4 mb-6">
          {character.profileImageUrl ? (
            <img
              alt={character.label}
              className="w-16 h-16 rounded-full object-cover border border-foreground/10"
              src={character.profileImageUrl}
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-foreground/5 flex items-center justify-center text-3xl">
              {character.emoji || '🤖'}
            </div>
          )}

          <div className="flex-1">
            <div className="flex flex-wrap gap-2">
              {character.loraStatus && (
                <Badge
                  className={
                    LORA_STATUS_COLORS[
                      character.loraStatus as keyof typeof LORA_STATUS_COLORS
                    ] ?? 'bg-foreground/5 text-foreground/60'
                  }
                >
                  LoRA: {character.loraStatus}
                </Badge>
              )}

              <Badge className="bg-success/10 text-success">
                {character.selectedImagesCount ?? 0} selected
              </Badge>

              <Badge className="bg-warning/10 text-warning">
                {character.reviewImagesCount ?? 0} review
              </Badge>

              <Badge className="bg-error/10 text-error">
                {character.trashedImagesCount ?? 0} trashed
              </Badge>
            </div>

            {character.loraModelPath && (
              <p className="mt-3 text-sm text-foreground/50">
                Active LoRA: {character.loraModelPath}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Dataset Upload */}
      <div className="mb-6">
        <DatasetUploader
          slug={slug}
          onUploadComplete={() => {
            void refreshAssets();
            void refreshCharacter();
          }}
        />
      </div>

      {/* Tab Navigation */}
      <div className="mb-6">
        <Tabs
          activeTab={activeTab}
          fullWidth={false}
          items={TABS.map((tab) => ({
            id: tab.key,
            label: tab.label,
          }))}
          onTabChange={(tab) => {
            setActiveTab(tab as ReviewTab);
            setSelectedIds(new Set());
          }}
          variant="underline"
        />
      </div>

      {/* Image Grid */}
      <ImageGrid
        images={filteredAssets}
        isLoading={isLoading || isActioning}
        moveLabel="Approve"
        onDelete={activeTab !== 'trash' ? handleDelete : undefined}
        onMove={activeTab === 'review' ? handleMove : undefined}
        onSelectionChange={setSelectedIds}
        selectedIds={selectedIds}
      />
    </Container>
  );
}
