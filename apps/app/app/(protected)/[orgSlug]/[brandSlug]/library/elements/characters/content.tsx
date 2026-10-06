'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import Card from '@ui/card/Card';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

import CharacterAvailabilityDialog from './character-availability-dialog';
import CharacterCreateDialog from './character-create-dialog';
import CharactersTable from './characters-table';
import { useCharactersPage } from './use-characters-page';

export default function LibraryCharactersPage(): ReactElement {
  const translate = useTranslations('common.settings.characters');
  const helpTranslate = useTranslations('pages.help');
  const { brandId } = useBrand();
  const {
    approve,
    approveCandidate,
    availabilityControls,
    brands,
    candidate,
    canManageSharing,
    characters,
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
  } = useCharactersPage();

  if (!brandId) {
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
        description={translate('subtitle')}
        label={translate('title')}
        right={
          !isLoading && characters.length > 0 ? (
            <Button
              onClick={openCreateDialog}
              variant={ButtonVariant.DEFAULT}
              withWrapper={false}
            >
              <Plus /> {translate('create.title')}
            </Button>
          ) : undefined
        }
      >
        <CharactersTable
          canManageSharing={canManageSharing}
          characters={characters}
          isLoading={isLoading}
          onCreate={openCreateDialog}
          onManageAvailability={availabilityControls.open}
        />
        <Link
          href={`${APP_ROUTES.SETTINGS.HELP}#characters`}
          className="text-sm text-muted-foreground underline underline-offset-4"
        >
          {helpTranslate('characterLink')}
        </Link>
      </Container>

      <CharacterAvailabilityDialog
        brands={brands}
        controls={availabilityControls}
      />

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
    </>
  );
}
