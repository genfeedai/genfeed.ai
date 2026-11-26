'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  ButtonVariant,
  LIBRARY_ELEMENT_KINDS,
  type LibraryElementKind,
  PageScope,
} from '@genfeedai/contracts';
import type { FilterMenuFacet } from '@genfeedai/props/ui/forms/filter-menu.props';
import type { LibraryElement } from '@services/content/library-elements.service';
import Card from '@ui/card/Card';
import SearchField from '@ui/content/search-field/SearchField';
import Container from '@ui/layout/container/Container';
import FilterMenu from '@ui/navigation/filter-menu/FilterMenu';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Button } from '@ui/primitives/button';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactElement, useMemo, useState } from 'react';

import CharacterAvailabilityDialog from './character-availability-dialog';
import CharacterCreateDialog from './character-create-dialog';
import CharacterReferencesDialog from './character-references-dialog';
import CharactersTable from './characters-table';
import ElementDialog from './element-dialog';
import ElementsTable from './elements-table';
import { useCharactersPage } from './use-characters-page';
import { useLibraryElements } from './use-library-elements';

const LEADING_AT = /^@/;

export default function LibraryCharactersPage({
  scope = PageScope.BRAND,
}: {
  scope?: PageScope.BRAND | PageScope.ORGANIZATION;
}): ReactElement {
  const isOrganizationScope = scope === PageScope.ORGANIZATION;
  const translate = useTranslations('common.settings.characters');
  const translateReferences = useTranslations('pages.library.references');
  const translateElements = useTranslations(
    'pages.library.references.elements',
  );
  const { brandId } = useBrand();
  const [referencesCharacterId, setReferencesCharacterId] = useState<
    string | null
  >(null);
  const [search, setSearch] = useState('');
  const [kinds, setKinds] = useState<LibraryElementKind[]>([]);
  const [isElementDialogOpen, setIsElementDialogOpen] = useState(false);
  const [editingElement, setEditingElement] = useState<LibraryElement>();
  const elementControls = useLibraryElements(kinds, search);
  const {
    applyReferences,
    approve,
    approveCandidate,
    availabilityControls,
    brands,
    candidate,
    canManageCharacter,
    canManageSharing,
    characters,
    pageTotals,
    create,
    createCharacter,
    discardCandidate,
    generateSheet,
    isCreateDialogOpen,
    isCreating,
    isGenerating,
    isLoading,
    openCreateDialog,
    setIsCreateDialogOpen,
    step,
  } = useCharactersPage(scope);

  const showCharacters = kinds.length === 0 || kinds.includes('CHARACTER');
  const showElements =
    kinds.length === 0 || kinds.some((kind) => kind !== 'CHARACTER');
  const visibleCharacters = useMemo(() => {
    const term = search.trim().replace(LEADING_AT, '').toLowerCase();
    return term
      ? characters.filter((character) =>
          `${character.label} ${character.handle ?? ''}`
            .toLowerCase()
            .includes(term),
        )
      : characters;
  }, [characters, search]);
  const typeFacets: FilterMenuFacet[] = [
    {
      key: 'type',
      label: translateElements('filters.type'),
      onChange: (values) =>
        setKinds(LIBRARY_ELEMENT_KINDS.filter((kind) => values.includes(kind))),
      options: LIBRARY_ELEMENT_KINDS.map((kind) => ({
        label: translateElements(`kinds.${kind}`),
        value: kind,
      })),
      selection: 'multiple',
      values: kinds,
    },
  ];
  const openElementDialog = (element?: LibraryElement) => {
    setEditingElement(element);
    setIsElementDialogOpen(true);
  };

  const referencesCharacter = characters.find(
    (character) => character.id === referencesCharacterId,
  );

  if (!isOrganizationScope && !brandId) {
    return (
      <Container>
        <Card>
          <p className="text-sm text-muted-foreground">
            {translate('errors.brandUnavailable')}
          </p>
        </Card>
      </Container>
    );
  }

  return (
    <>
      <Container
        label={translateReferences('title')}
        leading={
          <SearchField
            ariaLabel={translateElements('filters.searchLabel')}
            onSearch={setSearch}
            placeholder={translateElements('filters.searchPlaceholder')}
            value={search}
          >
            <FilterMenu
              clearLabel={translateElements('filters.clear')}
              facets={typeFacets}
              isAttached
              label={translateElements('filters.type')}
              onClear={() => setKinds([])}
            />
          </SearchField>
        }
        right={
          isOrganizationScope ? undefined : (
            <div className="flex items-center gap-2">
              {!isLoading && characters.length > 0 ? (
                <Button
                  onClick={openCreateDialog}
                  variant={ButtonVariant.SECONDARY}
                  withWrapper={false}
                >
                  <Plus /> {translate('create.title')}
                </Button>
              ) : null}
              <Button
                onClick={() => openElementDialog()}
                variant={ButtonVariant.DEFAULT}
                withWrapper={false}
              >
                <Plus /> {translateElements('create.title')}
              </Button>
            </div>
          )
        }
      >
        <div className="flex flex-col gap-8">
          {showCharacters ? (
            <section className="flex flex-col gap-3">
              {showElements ? (
                <h2 className="text-sm font-semibold">
                  {translate('list.title')}
                </h2>
              ) : null}
              <CharactersTable
                canManageCharacter={canManageCharacter}
                canManageSharing={canManageSharing}
                characters={visibleCharacters}
                isLoading={isLoading}
                onCreate={isOrganizationScope ? undefined : openCreateDialog}
                onManageAvailability={availabilityControls.open}
                onManageReferences={(character) =>
                  setReferencesCharacterId(character.id)
                }
              />
              {!isLoading && characters.length > 0 ? (
                <AutoPagination
                  showTotal
                  totalLabel="characters"
                  totals={pageTotals}
                />
              ) : null}
            </section>
          ) : null}
          {showElements && !isOrganizationScope ? (
            <section className="flex flex-col gap-3">
              {showCharacters ? (
                <h2 className="text-sm font-semibold">
                  {translateElements('title')}
                </h2>
              ) : null}
              <ElementsTable
                elements={elementControls.elements}
                isLoading={elementControls.isLoading}
                onCreate={() => openElementDialog()}
                onEdit={openElementDialog}
                onRemove={(element) => {
                  void elementControls.remove(element);
                }}
              />
            </section>
          ) : null}
        </div>
      </Container>

      {isElementDialogOpen ? (
        <ElementDialog
          element={editingElement}
          isBusy={elementControls.isBusy}
          key={editingElement?.id ?? 'new'}
          onClose={() => setIsElementDialogOpen(false)}
          onCreate={elementControls.create}
          onUpdate={elementControls.update}
        />
      ) : null}

      <CharacterAvailabilityDialog
        brands={brands}
        controls={availabilityControls}
      />

      {referencesCharacter ? (
        <CharacterReferencesDialog
          character={referencesCharacter}
          onChanged={(references) =>
            applyReferences(referencesCharacter.id, references)
          }
          onClose={() => setReferencesCharacterId(null)}
        />
      ) : null}

      {isOrganizationScope ? null : (
        <CharacterCreateDialog
          approve={approve}
          approveCandidate={approveCandidate}
          brandId={brandId}
          brands={brands}
          canManageSharing={canManageSharing}
          candidate={candidate}
          create={create}
          createCharacter={createCharacter}
          discardCandidate={discardCandidate}
          generateSheet={generateSheet}
          isCreating={isCreating}
          isGenerating={isGenerating}
          isOpen={isCreateDialogOpen}
          onOpenChange={setIsCreateDialogOpen}
          step={step}
        />
      )}
    </>
  );
}
