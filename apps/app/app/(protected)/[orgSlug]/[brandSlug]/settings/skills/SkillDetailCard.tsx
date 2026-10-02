import { ButtonVariant } from '@genfeedai/contracts';
import type { SkillDetailCardProps } from '@props/settings/skills.props';
import InsetSurface from '@ui/display/inset-surface/InsetSurface';
import { Button } from '@ui/primitives/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@ui/primitives/collapsible';
import { Input } from '@ui/primitives/input';
import { Label } from '@ui/primitives/label';
import { Textarea } from '@ui/primitives/textarea';
import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function SkillDetailCard({
  customizing,
  draftErrors,
  hasChanges,
  isForkBlocked,
  onCustomize,
  onSaveSkill,
  onSkillDraftChange,
  savingSkill,
  selectedSkill,
  skillDraft,
}: SkillDetailCardProps) {
  const translate = useTranslations('common.settings.skills');
  const fieldIdPrefix = selectedSkill ? `skill-${selectedSkill.id}` : 'skill';

  const isPending = customizing || savingSkill;
  const canEdit = selectedSkill?.canEdit === true;
  const errorFor = (field: keyof typeof skillDraft) =>
    draftErrors.find((error) => error.field === field);

  if (!selectedSkill) {
    return (
      <InsetSurface className="text-sm text-muted-foreground">
        {translate('detail.empty')}
      </InsetSurface>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2">
        <InsetSurface>
          <p className="gen-label mb-2 text-muted-foreground">
            {translate('detail.coverage')}
          </p>
          <p className="text-sm text-foreground/70">
            {translate('detail.coverageDescription', {
              channels:
                selectedSkill.channels.join(', ') ||
                translate('detail.generalChannels'),
              modalities: selectedSkill.modalities.join(', '),
            })}
          </p>
        </InsetSurface>
        <InsetSurface>
          <p className="gen-label mb-2 text-muted-foreground">
            {translate('detail.stage')}
          </p>
          <p className="text-sm text-foreground/70">
            {translate('detail.stageDescription', {
              stage: selectedSkill.workflowStage,
            })}
          </p>
        </InsetSurface>
      </div>

      <InsetSurface className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {translate('detail.definition')}
            </p>
            <p className="text-sm text-muted-foreground">
              {translate('detail.definitionDescription')}
            </p>
          </div>
          {selectedSkill.canFork === true ? (
            <Button
              disabled={isPending || isForkBlocked}
              icon={<Sparkles className="size-4" />}
              label={
                customizing
                  ? translate('actions.forking')
                  : translate('actions.fork')
              }
              onClick={() => {
                if (
                  selectedSkill.canFork === true &&
                  !isPending &&
                  !isForkBlocked
                )
                  onCustomize();
              }}
              variant={ButtonVariant.SECONDARY}
            />
          ) : null}
        </div>

        <div className="grid gap-2 text-sm">
          <Label htmlFor={`${fieldIdPrefix}-name`}>
            {translate('fields.name')}
          </Label>
          <Input
            disabled={!canEdit || isPending}
            aria-invalid={Boolean(errorFor('name'))}
            aria-describedby={
              errorFor('name') ? `${fieldIdPrefix}-name-error` : undefined
            }
            id={`${fieldIdPrefix}-name`}
            onChange={(event) =>
              canEdit &&
              !isPending &&
              onSkillDraftChange((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
            value={skillDraft.name}
          />
          {errorFor('name') ? (
            <p
              id={`${fieldIdPrefix}-name-error`}
              role="alert"
              className="text-sm text-destructive"
            >
              {translate('errors.fieldTooLong', {
                field: translate('fields.name'),
                maximum: errorFor('name')?.maximum ?? 0,
              })}
            </p>
          ) : null}
        </div>

        <div className="grid gap-2 text-sm">
          <Label htmlFor={`${fieldIdPrefix}-description`}>
            {translate('fields.description')}
          </Label>
          <Textarea
            className="min-h-24"
            disabled={!canEdit || isPending}
            aria-invalid={Boolean(errorFor('description'))}
            aria-describedby={
              errorFor('description')
                ? `${fieldIdPrefix}-description-error`
                : undefined
            }
            id={`${fieldIdPrefix}-description`}
            onChange={(event) =>
              canEdit &&
              !isPending &&
              onSkillDraftChange((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
            value={skillDraft.description}
          />
          {errorFor('description') ? (
            <p
              id={`${fieldIdPrefix}-description-error`}
              role="alert"
              className="text-sm text-destructive"
            >
              {translate('errors.fieldTooLong', {
                field: translate('fields.description'),
                maximum: errorFor('description')?.maximum ?? 0,
              })}
            </p>
          ) : null}
        </div>

        <div className="grid gap-2 text-sm">
          <Label htmlFor={`${fieldIdPrefix}-default-instructions`}>
            {translate('fields.defaultInstructions')}
          </Label>
          <Textarea
            className="min-h-28 font-mono text-sm"
            disabled={!canEdit || isPending}
            aria-invalid={Boolean(errorFor('defaultInstructions'))}
            aria-describedby={
              errorFor('defaultInstructions')
                ? `${fieldIdPrefix}-default-instructions-error`
                : undefined
            }
            id={`${fieldIdPrefix}-default-instructions`}
            onChange={(event) =>
              canEdit &&
              !isPending &&
              onSkillDraftChange((current) => ({
                ...current,
                defaultInstructions: event.target.value,
              }))
            }
            value={skillDraft.defaultInstructions}
          />
          {errorFor('defaultInstructions') ? (
            <p
              id={`${fieldIdPrefix}-default-instructions-error`}
              role="alert"
              className="text-sm text-destructive"
            >
              {translate('errors.fieldTooLong', {
                field: translate('fields.defaultInstructions'),
                maximum: errorFor('defaultInstructions')?.maximum ?? 0,
              })}
            </p>
          ) : null}
        </div>

        <Collapsible>
          <CollapsibleTrigger className="text-sm font-medium text-muted-foreground hover:text-foreground">
            {translate('fields.systemPromptTemplate')}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="space-y-2 pt-2">
              <Label
                className="sr-only"
                htmlFor={`${fieldIdPrefix}-system-prompt`}
              >
                {translate('fields.systemPromptTemplate')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {translate('fields.systemPromptHelp')}
              </p>
              <Textarea
                className="min-h-32 w-full font-mono text-sm"
                disabled={!canEdit || isPending}
                aria-invalid={Boolean(errorFor('systemPromptTemplate'))}
                aria-describedby={
                  errorFor('systemPromptTemplate')
                    ? `${fieldIdPrefix}-system-prompt-error`
                    : undefined
                }
                id={`${fieldIdPrefix}-system-prompt`}
                onChange={(event) =>
                  canEdit &&
                  !isPending &&
                  onSkillDraftChange((current) => ({
                    ...current,
                    systemPromptTemplate: event.target.value,
                  }))
                }
                placeholder={translate('fields.systemPromptPlaceholder')}
                value={skillDraft.systemPromptTemplate}
              />
              {errorFor('systemPromptTemplate') ? (
                <p
                  id={`${fieldIdPrefix}-system-prompt-error`}
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {translate('errors.fieldTooLong', {
                    field: translate('fields.systemPromptTemplate'),
                    maximum: errorFor('systemPromptTemplate')?.maximum ?? 0,
                  })}
                </p>
              ) : null}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {canEdit ? (
          <Button
            disabled={isPending || !hasChanges || draftErrors.length > 0}
            label={
              savingSkill
                ? translate('actions.saving')
                : translate('actions.saveSkill')
            }
            onClick={() => {
              if (
                canEdit &&
                !isPending &&
                hasChanges &&
                draftErrors.length === 0
              )
                onSaveSkill();
            }}
            variant={ButtonVariant.DEFAULT}
          />
        ) : null}
      </InsetSurface>
    </div>
  );
}
