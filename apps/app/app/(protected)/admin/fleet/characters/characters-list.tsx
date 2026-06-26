'use client';

import ButtonRefresh from '@components/buttons/refresh/button-refresh/ButtonRefresh';
import type { IFleetCharacter } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { AdminFleetService } from '@services/admin/fleet.service';
import { logger } from '@services/core/logger.service';
import { useQuery } from '@tanstack/react-query';
import Card from '@ui/card/Card';
import CardEmpty from '@ui/card/empty/CardEmpty';
import Badge from '@ui/display/badge/Badge';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import Container from '@ui/layout/container/Container';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect } from 'react';
import { HiOutlineUserCircle } from 'react-icons/hi2';

const LORA_STATUS_COLORS = {
  completed: 'bg-success/10 text-success',
  failed: 'bg-error/10 text-error',
  pending: 'bg-warning/10 text-warning',
  training: 'bg-info/10 text-info',
} as const;

export default function CharactersList() {
  const getFleetService = useAuthedService((token: string) =>
    AdminFleetService.getInstance(token),
  );

  const {
    data: characters,
    isLoading,
    isFetching,
    error: charactersError,
    refetch: refresh,
  } = useQuery<IFleetCharacter[]>({
    queryKey: ['fleet-characters'],
    queryFn: async () => {
      const service = await getFleetService();
      return service.getCharacters();
    },
  });

  const isRefreshing = isFetching && !isLoading;

  useEffect(() => {
    if (charactersError) {
      logger.error('GET /admin/fleet/characters failed', charactersError);
    }
  }, [charactersError]);

  if (isLoading) {
    return (
      <Container
        label="Characters"
        description="Manage AI personas for fleet content generation"
        icon={HiOutlineUserCircle}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from(
            { length: 6 },
            (_, index) => `character-${index + 1}`,
          ).map((key) => (
            <SkeletonCard key={key} showImage={false} />
          ))}
        </div>
      </Container>
    );
  }

  return (
    <Container
      label="Characters"
      description="Manage AI personas for fleet content generation"
      icon={HiOutlineUserCircle}
      right={
        <ButtonRefresh onClick={() => refresh()} isRefreshing={isRefreshing} />
      }
    >
      {charactersError ? (
        <CardEmpty
          label="Failed to load characters"
          description="Refresh the Fleet characters list and try again."
          action={{ label: 'Retry', onClick: () => void refresh() }}
        />
      ) : !characters || characters.length === 0 ? (
        <CardEmpty label="No characters found" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {characters.map((character) => (
            <Link
              key={character.id}
              href={`/admin/fleet/characters/${character.slug}`}
            >
              <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                <div className="p-6">
                  {/* Header: Emoji + Label */}
                  <div className="flex items-center gap-3 mb-4">
                    {character.profileImageUrl ? (
                      <Image
                        unoptimized
                        alt={character.label}
                        className="size-12 rounded-full object-cover border border-foreground/10"
                        src={character.profileImageUrl}
                        width={800}
                        height={600}
                      />
                    ) : (
                      <div className="size-12 rounded-full bg-foreground/5 flex items-center justify-center text-2xl">
                        {character.emoji || '🤖'}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold truncate">
                        {character.emoji && (
                          <span className="mr-1.5">{character.emoji}</span>
                        )}
                        {character.label}
                      </h3>

                      {character.niche && (
                        <p className="text-sm text-foreground/60 truncate">
                          {character.niche}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Stats Badges */}
                  <div className="flex flex-wrap gap-2 mb-4">
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

                  {/* LoRA Status */}
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
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </Container>
  );
}
