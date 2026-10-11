'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createLibraryBrowserRoute,
} from '@genfeedai/contracts/constants';
import type { BrandCharacterListItem } from '@genfeedai/contracts/interfaces';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { CharactersTableProps } from '@props/characters/characters-page.props';
import type { TableColumn } from '@props/ui/display/table.props';
import { EnvironmentService } from '@services/core/environment.service';
import { CardEmptyContent } from '@ui/card/empty/CardEmpty';
import AppTable from '@ui/display/table/Table';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { Plus, Share2, UserRound } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

function resolveCharacterImageUrl(id: string): string {
  return `${EnvironmentService.ingredientsEndpoint}/images/${id}`;
}

export default function CharactersTable({
  canManageSharing,
  characters,
  isLoading,
  onCreate,
  onManageAvailability,
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
            {canManageSharing && !character.isGranted ? (
              <Button
                aria-label={translate('availability.manageFor', {
                  name: character.label,
                })}
                label={translate('availability.manage')}
                onClick={() => onManageAvailability(character)}
                variant={ButtonVariant.GHOST}
              />
            ) : null}
          </div>
        ),
      },
      {
        header: translate('list.libraryColumn'),
        key: 'library',
        render: (character) => (
          <Button
            aria-label={translate('list.viewInLibraryFor', {
              name: character.label,
            })}
            asChild
            variant={ButtonVariant.GHOST}
            withWrapper={false}
          >
            <Link
              href={href(
                createLibraryBrowserRoute(APP_ROUTES.LIBRARY.ASSETS, {
                  characters: [character.id],
                }),
              )}
            >
              {translate('list.viewInLibrary')}
            </Link>
          </Button>
        ),
      },
    ],
    [canManageSharing, href, onManageAvailability, translate],
  );

  return (
    <AppTable<BrandCharacterListItem>
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
