'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonVariant } from '@genfeedai/contracts';
import Card from '@ui/card/Card';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';

import CharacterCreateDialog from './character-create-dialog';
import CharactersTable from './characters-table';
import { useCharactersPage } from './use-characters-page';

export default function BrandSettingsCharactersPage(): ReactElement {
  const translate = useTranslations('common.settings.characters');
  const { brandId } = useBrand();
  const {
    approve,
    approveCandidate,
    candidate,
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
          <Button
            onClick={openCreateDialog}
            variant={ButtonVariant.DEFAULT}
            withWrapper={false}
          >
            <Plus /> {translate('create.title')}
          </Button>
        }
      >
        <CharactersTable
          characters={characters}
          isLoading={isLoading}
          onCreate={openCreateDialog}
        />
      </Container>

      <CharacterCreateDialog
        approve={approve}
        approveCandidate={approveCandidate}
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
