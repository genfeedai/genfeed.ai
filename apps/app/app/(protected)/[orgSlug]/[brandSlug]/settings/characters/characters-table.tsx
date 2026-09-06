'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { BrandCharacterListItem } from '@genfeedai/contracts/interfaces';
import type { CharactersTableProps } from '@props/characters/characters-page.props';
import type { TableColumn } from '@props/ui/display/table.props';
import { EnvironmentService } from '@services/core/environment.service';
import { CardEmptyContent } from '@ui/card/empty/CardEmpty';
import AppTable from '@ui/display/table/Table';
import { Button } from '@ui/primitives/button';
import { Plus, UserRound } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

function resolveCharacterImageUrl(id: string): string {
  return `${EnvironmentService.ingredientsEndpoint}/images/${id}`;
}

export default function CharactersTable({
  characters,
  isLoading,
  onCreate,
}: CharactersTableProps) {
  const translate = useTranslations('common.settings.characters');

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
    ],
    [translate],
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
