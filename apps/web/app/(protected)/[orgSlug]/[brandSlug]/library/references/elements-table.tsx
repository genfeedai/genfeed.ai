'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { TableAction, TableColumn } from '@props/ui/display/table.props';
import type { LibraryElement } from '@services/content/library-elements.service';
import AppTable from '@ui/display/table/Table';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { EmptyState } from '@ui/primitives/empty-state';
import { Mountain, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import IngredientThumbnail from '@/components/ingredients/ingredient-thumbnail/IngredientThumbnail';
import { useIngredientsById } from '@/hooks/media/use-ingredients-by-id';
import type { ElementsTableProps } from '@/props/characters/library-elements.props';
import { LIBRARY_ELEMENT_KIND_ICONS } from './library-element-kind';

const VISIBLE_REFERENCE_THUMBNAILS = 4;

export default function ElementsTable({
  elements,
  isLoading,
  onCreate,
  onEdit,
  onRemove,
}: ElementsTableProps) {
  const translate = useTranslations('pages.library.references.elements');
  const ingredients = useIngredientsById(
    useMemo(
      () =>
        elements.flatMap((element) =>
          element.referenceIngredientIds.slice(0, VISIBLE_REFERENCE_THUMBNAILS),
        ),
      [elements],
    ),
  );

  const columns = useMemo<TableColumn<LibraryElement>[]>(
    () => [
      {
        header: translate('columns.name'),
        key: 'label',
        render: (element) => {
          const Icon = LIBRARY_ELEMENT_KIND_ICONS[element.kind];
          return (
            <div className="flex items-center gap-3">
              {element.coverIngredientId ? (
                <IngredientThumbnail
                  alt={element.label}
                  className="size-10 rounded object-cover outline-media"
                  ingredient={ingredients.get(element.coverIngredientId)}
                  size={40}
                />
              ) : (
                <span className="flex size-10 items-center justify-center rounded bg-tertiary text-muted-foreground">
                  <Icon className="size-4" />
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{element.label}</p>
                {element.handle ? (
                  <p className="truncate text-xs text-muted-foreground">
                    @{element.handle}
                  </p>
                ) : null}
              </div>
            </div>
          );
        },
      },
      {
        header: translate('columns.type'),
        key: 'kind',
        render: (element) => {
          const Icon = LIBRARY_ELEMENT_KIND_ICONS[element.kind];
          return (
            <Badge icon={<Icon />}>{translate(`kinds.${element.kind}`)}</Badge>
          );
        },
      },
      {
        header: translate('columns.files'),
        key: 'references',
        render: (element) => {
          if (element.referenceIngredientIds.length === 0) {
            return (
              <span className="text-xs text-muted-foreground">
                {translate('files.empty')}
              </span>
            );
          }
          const hidden =
            element.referenceIngredientIds.length -
            VISIBLE_REFERENCE_THUMBNAILS;
          return (
            <div className="flex items-center gap-1.5">
              {element.referenceIngredientIds
                .slice(0, VISIBLE_REFERENCE_THUMBNAILS)
                .map((ingredientId, index) => (
                  <IngredientThumbnail
                    alt={translate('files.imageAlt', {
                      name: element.label,
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
                    title={index === 0 ? translate('files.cover') : undefined}
                  />
                ))}
              {hidden > 0 ? (
                <span className="text-xs text-muted-foreground">
                  {translate('files.more', { count: hidden })}
                </span>
              ) : null}
            </div>
          );
        },
      },
    ],
    [ingredients, translate],
  );

  const actions = useMemo<TableAction<LibraryElement>[]>(
    () => [
      {
        ariaLabel: (element) =>
          translate('actions.editFor', { name: element.label }),
        icon: <Pencil />,
        onClick: onEdit,
        tooltip: translate('actions.edit'),
      },
      {
        ariaLabel: (element) =>
          translate('actions.removeFor', { name: element.label }),
        icon: <Trash2 />,
        onClick: onRemove,
        tooltip: translate('actions.remove'),
      },
    ],
    [onEdit, onRemove, translate],
  );

  return (
    <AppTable<LibraryElement>
      actions={actions}
      ariaLabel={translate('title')}
      columns={columns}
      emptyState={
        <EmptyState
          actions={
            onCreate ? (
              <Button
                onClick={onCreate}
                variant={ButtonVariant.DEFAULT}
                withWrapper={false}
              >
                <Plus /> {translate('create.title')}
              </Button>
            ) : undefined
          }
          description={translate('empty')}
          icon={Mountain}
          title={translate('title')}
        />
      }
      getRowKey={(element) => element.id}
      isLoading={isLoading}
      items={elements}
    />
  );
}
