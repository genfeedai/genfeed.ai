'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { CharacterCreateDialogProps } from '@props/characters/characters-page.props';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import Image from 'next/image';
import { useTranslations } from 'next-intl';

export default function CharacterCreateDialog({
  approve,
  candidate,
  create,
  discardCandidate,
  approveCandidate,
  createCharacter,
  generateSheet,
  isCreating,
  isGenerating,
  isOpen,
  onOpenChange,
  step,
}: CharacterCreateDialogProps) {
  const translate = useTranslations('common.settings.characters');

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{translate('create.title')}</DialogTitle>
          <DialogDescription>
            {translate('create.description')}
          </DialogDescription>
        </DialogHeader>

        {step === 'describe' || step === 'candidate' ? (
          <div className="flex flex-col gap-3">
            <Textarea
              aria-label={translate('fields.description')}
              data-testid="character-description"
              isDisabled={isGenerating || step === 'candidate'}
              onChange={(event) => create.setDescription(event.target.value)}
              placeholder={translate('fields.descriptionPlaceholder')}
              value={create.description}
            />
            <Checkbox
              isChecked={create.isNonHumanoid}
              isDisabled={isGenerating || step === 'candidate'}
              label={translate('fields.nonHumanoid')}
              name="character-non-humanoid"
              onCheckedChange={(checked) =>
                create.setIsNonHumanoid(checked === true)
              }
            />
            <Input
              aria-label={translate('fields.seed')}
              data-testid="character-seed"
              isDisabled={isGenerating || step === 'candidate'}
              onChange={(event) => create.setSeed(event.target.value)}
              placeholder={translate('fields.seed')}
              value={create.seed}
            />
            {step === 'describe' ? (
              <Button
                data-testid="generate-sheet"
                isDisabled={
                  isGenerating || create.description.trim().length === 0
                }
                isLoading={isGenerating}
                label={
                  isGenerating
                    ? translate('actions.generating')
                    : translate('actions.generate')
                }
                onClick={() => {
                  void generateSheet();
                }}
                size={ButtonSize.DEFAULT}
                variant={ButtonVariant.DEFAULT}
              />
            ) : null}
          </div>
        ) : null}

        {step === 'candidate' && candidate ? (
          <div className="flex flex-col gap-3">
            <Image
              alt={translate('candidate.alt')}
              className="w-full rounded object-cover outline-media"
              data-testid="candidate-image"
              height={512}
              src={candidate.url}
              width={512}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                data-testid="regenerate-sheet"
                isDisabled={isGenerating}
                isLoading={isGenerating}
                label={translate('actions.regenerate')}
                onClick={() => {
                  void generateSheet();
                }}
                variant={ButtonVariant.SECONDARY}
              />
              <Button
                data-testid="discard-sheet"
                isDisabled={isGenerating}
                label={translate('actions.discard')}
                onClick={discardCandidate}
                variant={ButtonVariant.GHOST}
              />
              <Button
                data-testid="approve-sheet"
                isDisabled={isGenerating}
                label={translate('actions.approve')}
                onClick={approveCandidate}
                variant={ButtonVariant.DEFAULT}
              />
            </div>
          </div>
        ) : null}

        {step === 'approve' && candidate ? (
          <div className="flex flex-col gap-3">
            <Image
              alt={translate('candidate.alt')}
              className="w-full rounded object-cover outline-media"
              height={512}
              src={candidate.url}
              width={512}
            />
            <Input
              aria-label={translate('fields.name')}
              data-testid="character-name"
              onChange={(event) => approve.setLabel(event.target.value)}
              placeholder={translate('fields.namePlaceholder')}
              value={approve.label}
            />
            <Input
              aria-label={translate('fields.handle')}
              data-testid="character-handle"
              onChange={(event) => approve.setHandle(event.target.value)}
              placeholder={translate('fields.handlePlaceholder')}
              value={approve.handle}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                data-testid="discard-sheet"
                isDisabled={isCreating}
                label={translate('actions.discard')}
                onClick={discardCandidate}
                variant={ButtonVariant.GHOST}
              />
              <Button
                data-testid="create-character"
                isDisabled={isCreating}
                isLoading={isCreating}
                label={
                  isCreating
                    ? translate('actions.creating')
                    : translate('actions.approve')
                }
                onClick={() => {
                  void createCharacter();
                }}
                variant={ButtonVariant.DEFAULT}
              />
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
