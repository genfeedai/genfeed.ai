'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createLibraryBrowserRoute,
} from '@genfeedai/contracts/constants';
import type { BrandCharacterListItem } from '@genfeedai/contracts/interfaces';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { CharactersTableProps } from '@props/characters/characters-page.props';
import type { TableAction, TableColumn } from '@props/ui/display/table.props';
import { EnvironmentService } from '@services/core/environment.service';
import { CardEmptyContent } from '@ui/card/empty/CardEmpty';
import AppTable from '@ui/display/table/Table';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { FolderOpen, Images, Plus, Share2, UserRound } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

const VISIBLE_REFERENCE_THUMBNAILS = 4;

function resolveCharacterImageUrl(id: string): string {
  return `${EnvironmentService.ingredientsEndpoint}/images/${id}`;
}

export default function CharactersTable({
  canManageSharing,
  characters,
  isLoading,
  onCreate,
  onManageAvailability,
  onManageReferences,
}: CharactersTableProps) {
  const translate = useTranslations('common.settings.characters');
  const { href } = useOrgUrl();

  const columns = useMemo<TableColumn<BrandCharacterListItem>[]>(
    () => [
      {
        header: translate('fields.name'),
        key: 'label',
        render: (character) => (
          <div className="flex items-center gap-3">
            {character.avatarIngredientId ? (
              <Image
                alt={character.label}
                className="size-10 rounded object-cover outline-media"
                height={40}
                src={resolveCharacterImageUrl(character.avatarIngredientId)}
                width={40}
              />
            ) : (
              <span className="flex size-10 items-center justify-center rounded bg-background-tertiary text-muted-foreground">
                <UserRound className="size-4" />
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{character.label}</p>
              {character.handle ? (
                <p className="truncate text-xs text-muted-foreground">
                  @{character.handle}
                </p>
              ) : null}
            </div>
          </div>
        ),
      },
      {
        header: translate('references.column'),
        key: 'references',
        render: (character) => {
          const referenceIds = character.referenceIngredientIds;
          if (referenceIds.length === 0) {
            return (
              <span className="text-xs text-muted-foreground">
                {translate('references.empty')}
              </span>
            );
          }
          const hiddenCount =
            referenceIds.length - VISIBLE_REFERENCE_THUMBNAILS;
          return (
            <div className="flex items-center gap-1.5">
              {referenceIds
                .slice(0, VISIBLE_REFERENCE_THUMBNAILS)
                .map((ingredientId, index) => (
                  <Image
                    alt={translate('references.imageAlt', {
                      name: character.label,
                      position: index + 1,
                    })}
                    className={
                      index === 0
                        ? 'size-8 rounded object-cover outline-media ring-2 ring-primary'
                        : 'size-8 rounded object-cover outline-media'
                    }
                    height={32}
                    key={ingredientId}
                    src={resolveCharacterImageUrl(ingredientId)}
                    title={
                      index === 0 ? translate('references.primary') : undefined
                    }
                    width={32}
                  />
                ))}
              {hiddenCount > 0 ? (
                <span className="text-xs text-muted-foreground">
                  {translate('references.more', { count: hiddenCount })}
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        header: translate('availability.column'),
        key: 'availability',
        render: (character) => (
          <div className="flex flex-wrap items-center gap-2">
            {character.isGranted ? (
              <Badge icon={<Share2 />}>
                {translate('grants.grantedByBadge', {
                  organization: character.grantedByOrganizationName ?? '',
                })}
              </Badge>
            ) : character.isShared ? (
              <Badge icon={<Share2 />}>
                {translate('availability.sharedBadge', {
                  brand: character.owningBrandName ?? '',
                  count: character.availableBrandCount ?? 0,
                })}
              </Badge>
            ) : (
              <span className="text-xs text-muted-foreground">
                {translate('availability.modes.owningBrand.label')}
              </span>
            )}
          </div>
        ),
      },
    ],
    [translate],
  );

  const actions = useMemo<TableAction<BrandCharacterListItem>[]>(
    () => [
      {
        icon: <Images />,
        isVisible: (character) => !character.isGranted,
        onClick: onManageReferences,
        tooltip: (character) =>
          translate('references.manageFor', { name: character.label }),
      },
      {
        icon: <Share2 />,
        isVisible: (character) => canManageSharing && !character.isGranted,
        onClick: onManageAvailability,
        tooltip: (character) =>
          translate('availability.manageFor', { name: character.label }),
      },
      {
        href: (character) =>
          href(
            createLibraryBrowserRoute(APP_ROUTES.LIBRARY.ASSETS, {
              characters: [character.id],
            }),
          ),
        icon: <FolderOpen />,
        tooltip: (character) =>
          translate('list.viewInLibraryFor', { name: character.label }),
      },
    ],
    [
      canManageSharing,
      href,
      onManageAvailability,
      onManageReferences,
      translate,
    ],
  );

  return (
    <AppTable<BrandCharacterListItem>
      actions={actions}
      ariaLabel={translate('list.title')}
      columns={columns}
      emptyState={
        <CardEmptyContent
          description={translate('empty')}
          icon={UserRound}
          label={translate('list.title')}
          actions={
            <Button
              onClick={onCreate}
              variant={ButtonVariant.DEFAULT}
              withWrapper={false}
            >
              <Plus /> {translate('create.title')}
            </Button>
          }
        />
      }
      getRowKey={(character) => character.id}
      isLoading={isLoading}
      items={characters}
    />
  );
}
