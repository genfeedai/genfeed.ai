'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createLibraryBrowserRoute,
} from '@genfeedai/contracts/constants';
import type { BrandCharacterListItem } from '@genfeedai/contracts/interfaces';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { CharactersTableProps } from '@props/characters/characters-page.props';
import type { TableAction, TableColumn } from '@props/ui/display/table.props';
import { CardEmptyContent } from '@ui/card/empty/CardEmpty';
import { createSummaryRowSidebar } from '@ui/display/table/summary-row-sidebar';
import AppTable from '@ui/display/table/Table';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { FolderOpen, Images, Plus, Share2, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import CharacterImage from './character-image';
import { useCharacterIngredients } from './use-character-ingredients';

const VISIBLE_REFERENCE_THUMBNAILS = 4;

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
  const ingredients = useCharacterIngredients(
    useMemo(
      () =>
        characters.flatMap((character) => [
          ...(character.avatarIngredientId
            ? [character.avatarIngredientId]
            : []),
          ...character.referenceIngredientIds.slice(
            0,
            VISIBLE_REFERENCE_THUMBNAILS,
          ),
        ]),
      [characters],
    ),
  );

  const columns = useMemo<TableColumn<BrandCharacterListItem>[]>(
    () => [
      {
        header: translate('fields.name'),
        key: 'label',
        render: (character) => (
          <div className="flex items-center gap-3">
            {character.avatarIngredientId ? (
              <CharacterImage
                alt={character.label}
                className="size-10 rounded object-cover outline-media"
                ingredient={ingredients.get(character.avatarIngredientId)}
                size={40}
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
                  <CharacterImage
                    alt={translate('references.imageAlt', {
                      name: character.label,
                      position: index + 1,
                    })}
                    className={
                      index === 0
                        ? 'size-8 rounded object-cover outline-media ring-2 ring-primary'
                        : 'size-8 rounded object-cover outline-media'
                    }
                    ingredient={ingredients.get(ingredientId)}
                    key={ingredientId}
                    size={32}
                    title={
                      index === 0 ? translate('references.primary') : undefined
                    }
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
    [ingredients, translate],
  );

  const actions = useMemo<TableAction<BrandCharacterListItem>[]>(
    () => [
      {
        icon: <Images />,
        isVisible: (character) => !character.isGranted,
        onClick: onManageReferences,
        ariaLabel: (character) =>
          translate('references.manageFor', { name: character.label }),
        tooltip: translate('references.column'),
      },
      {
        icon: <Share2 />,
        isVisible: (character) => canManageSharing && !character.isGranted,
        onClick: onManageAvailability,
        ariaLabel: (character) =>
          translate('availability.manageFor', { name: character.label }),
        tooltip: translate('availability.column'),
      },
      {
        href: (character) =>
          href(
            createLibraryBrowserRoute(APP_ROUTES.LIBRARY.ASSETS, {
              characters: [character.id],
            }),
          ),
        icon: <FolderOpen />,
        ariaLabel: (character) =>
          translate('list.viewInLibraryFor', { name: character.label }),
        tooltip: translate('list.libraryColumn'),
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

  const rowSidebar = useMemo(
    () =>
      createSummaryRowSidebar<BrandCharacterListItem>({
        getBadges: (character) =>
          character.isGranted ? (
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
          ) : null,
        getFacts: (character) => [
          {
            id: 'references',
            label: translate('references.column'),
            value:
              character.referenceIngredientIds.length === 0
                ? translate('references.empty')
                : character.referenceIngredientIds.length,
          },
          {
            id: 'availability',
            label: translate('availability.column'),
            value:
              character.isGranted || character.isShared
                ? undefined
                : translate('availability.modes.owningBrand.label'),
          },
        ],
        getId: (character) => character.id,
        getSubtitle: (character) =>
          character.handle ? `@${character.handle}` : undefined,
        getTitle: (character) => character.label,
        kind: 'record',
        renderExtra: (character) => (
          <div className="flex flex-col items-start gap-2">
            {!character.isGranted ? (
              <Button
                icon={<Images className="size-3.5" />}
                label={translate('references.manageFor', {
                  name: character.label,
                })}
                onClick={() => onManageReferences(character)}
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
              />
            ) : null}
            {canManageSharing && !character.isGranted ? (
              <Button
                icon={<Share2 className="size-3.5" />}
                label={translate('availability.manageFor', {
                  name: character.label,
                })}
                onClick={() => onManageAvailability(character)}
                size={ButtonSize.SM}
                variant={ButtonVariant.SECONDARY}
              />
            ) : null}
            <Button
              asChild
              icon={<FolderOpen className="size-3.5" />}
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
            >
              <Link
                href={href(
                  createLibraryBrowserRoute(APP_ROUTES.LIBRARY.ASSETS, {
                    characters: [character.id],
                  }),
                )}
              >
                {translate('list.viewInLibraryFor', { name: character.label })}
              </Link>
            </Button>
          </div>
        ),
      }),
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
      rowSidebar={rowSidebar}
    />
  );
}
