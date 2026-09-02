'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { Skill } from '@services/content/skills.service';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
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
import { FlaskConical, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

type SkillDraft = {
  defaultInstructions: string;
  description: string;
  name: string;
  systemPromptTemplate: string;
};

type Props = {
  customizing: boolean;
  onCustomize: () => void;
  onOpenTestInChat: () => void;
  onSaveSkill: () => void;
  onSkillDraftChange: (updater: (current: SkillDraft) => SkillDraft) => void;
  savingSkill: boolean;
  selectedSkill: Skill | null;
  skillDraft: SkillDraft;
};

export default function SkillDetailCard({
  customizing,
  onCustomize,
  onOpenTestInChat,
  onSaveSkill,
  onSkillDraftChange,
  savingSkill,
  selectedSkill,
  skillDraft,
}: Props) {
  const translate = useTranslations('common.settings.skills');
  const fieldIdPrefix = selectedSkill ? `skill-${selectedSkill.id}` : 'skill';

  return (
    <Card bodyClassName="gap-0 p-5" className="rounded-3xl">
      {selectedSkill ? (
        <div className="space-y-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-foreground">
                {selectedSkill.name}
              </h2>
              <Badge
                className="px-2 py-1 text-2xs uppercase tracking-[0.14em]"
                variant="outline"
              >
                {selectedSkill.slug}
              </Badge>
              {selectedSkill.version ? (
                <Badge
                  className="px-2 py-1 text-2xs uppercase tracking-[0.14em]"
                  variant="ghost"
                >
                  {translate('detail.version', {
                    version: selectedSkill.version,
                  })}
                </Badge>
              ) : null}
            </div>
            <p className="text-sm text-foreground/60">
              {selectedSkill.description}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <InsetSurface>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-foreground/45">
                {translate('detail.coverage')}
              </p>
              <p className="text-sm text-foreground/65">
                {translate('detail.coverageDescription', {
                  channels:
                    selectedSkill.channels.join(', ') ||
                    translate('detail.generalChannels'),
                  modalities: selectedSkill.modalities.join(', '),
                })}
              </p>
            </InsetSurface>
            <InsetSurface>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-foreground/45">
                {translate('detail.stage')}
              </p>
              <p className="text-sm text-foreground/65">
                {translate('detail.stageDescription', {
                  stage: selectedSkill.workflowStage,
                })}
              </p>
            </InsetSurface>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              className="rounded-full"
              onClick={onOpenTestInChat}
              variant={ButtonVariant.SECONDARY}
            >
              <FlaskConical className="size-4" />
              {translate('actions.testWithAgent')}
            </Button>
          </div>

          <InsetSurface className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {translate('detail.definition')}
                </p>
                <p className="text-sm text-foreground/55">
                  {translate('detail.definitionDescription')}
                </p>
              </div>
              {!selectedSkill.organization ? (
                <Button
                  className="rounded-full"
                  disabled={customizing}
                  onClick={onCustomize}
                  variant={ButtonVariant.SECONDARY}
                >
                  <Sparkles className="size-4" />
                  {customizing
                    ? translate('actions.customizing')
                    : translate('actions.customize')}
                </Button>
              ) : null}
            </div>

            <div className="grid gap-2 text-sm text-foreground/70">
              <Label htmlFor={`${fieldIdPrefix}-name`}>
                {translate('fields.name')}
              </Label>
              <Input
                className="rounded-2xl px-3 py-2"
                disabled={!selectedSkill.organization}
                id={`${fieldIdPrefix}-name`}
                onChange={(event) =>
                  onSkillDraftChange((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                value={skillDraft.name}
              />
            </div>

            <div className="grid gap-2 text-sm text-foreground/70">
              <Label htmlFor={`${fieldIdPrefix}-description`}>
                {translate('fields.description')}
              </Label>
              <Textarea
                className="min-h-24 rounded-2xl px-3 py-2"
                disabled={!selectedSkill.organization}
                id={`${fieldIdPrefix}-description`}
                onChange={(event) =>
                  onSkillDraftChange((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                value={skillDraft.description}
              />
            </div>

            <div className="grid gap-2 text-sm text-foreground/70">
              <Label htmlFor={`${fieldIdPrefix}-default-instructions`}>
                {translate('fields.defaultInstructions')}
              </Label>
              <Textarea
                className="min-h-28 rounded-2xl px-3 py-2 text-sm font-mono"
                disabled={!selectedSkill.organization}
                id={`${fieldIdPrefix}-default-instructions`}
                onChange={(event) =>
                  onSkillDraftChange((current) => ({
                    ...current,
                    defaultInstructions: event.target.value,
                  }))
                }
                value={skillDraft.defaultInstructions}
              />
            </div>

            <Collapsible>
              <CollapsibleTrigger className="text-sm font-medium text-foreground/50 hover:text-foreground/70">
                {translate('fields.systemPromptTemplate')}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-2">
                  <Label
                    className="sr-only"
                    htmlFor={`${fieldIdPrefix}-system-prompt`}
                  >
                    {translate('fields.systemPromptTemplate')}
                  </Label>
                  <p className="text-xs text-foreground/40">
                    {translate('fields.systemPromptHelp')}
                  </p>
                  <Textarea
                    className="min-h-32 w-full rounded-2xl px-3 py-2 text-sm font-mono"
                    disabled={!selectedSkill.organization}
                    id={`${fieldIdPrefix}-system-prompt`}
                    onChange={(event) =>
                      onSkillDraftChange((current) => ({
                        ...current,
                        systemPromptTemplate: event.target.value,
                      }))
                    }
                    placeholder={translate('fields.systemPromptPlaceholder')}
                    value={skillDraft.systemPromptTemplate}
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>

            {selectedSkill.organization ? (
              <Button
                disabled={savingSkill}
                onClick={onSaveSkill}
                variant={ButtonVariant.DEFAULT}
              >
                {savingSkill
                  ? translate('actions.saving')
                  : translate('actions.saveVariant')}
              </Button>
            ) : null}
          </InsetSurface>
        </div>
      ) : (
        <InsetSurface className="text-sm text-foreground/55">
          {translate('detail.empty')}
        </InsetSurface>
      )}
    </Card>
  );
}
