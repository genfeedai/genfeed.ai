'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { Skill } from '@services/content/skills.service';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import InsetSurface from '@ui/display/inset-surface/InsetSurface';
import { Button } from '@ui/primitives/button';
import { Switch } from '@ui/primitives/switch';
import { useTranslations } from 'next-intl';
import {
  MODALITY_FILTERS,
  type ModalityFilterValue,
  STAGE_FILTERS,
  type StageFilterValue,
} from './skill-filter-options';

function getSourceBadgeVariant(
  source: Skill['source'],
): 'accent' | 'outline' | 'secondary' {
  switch (source) {
    case 'custom':
    case 'customized':
      return 'accent';
    case 'imported':
      return 'secondary';
    default:
      return 'outline';
  }
}

function getModalityBadgeVariant(
  modality: string,
): 'audio' | 'ghost' | 'image' | 'multimodal' | 'text' | 'video' {
  switch (modality) {
    case 'audio':
      return 'audio';
    case 'image':
      return 'image';
    case 'multi':
      return 'multimodal';
    case 'text':
      return 'text';
    case 'video':
      return 'video';
    default:
      return 'ghost';
  }
}

type Props = {
  enabledSlugs: string[];
  filteredSkills: Skill[];
  isLoading: boolean;
  isTogglingSkill: boolean;
  modalityFilter: ModalityFilterValue;
  onModalityFilterChange: (value: ModalityFilterValue) => void;
  onSkillSelect: (id: string) => void;
  onStageFilterChange: (value: StageFilterValue) => void;
  onToggleSkill: (slug: string) => void;
  selectedSkillId: string | undefined;
  stageFilter: StageFilterValue;
};

export default function SkillCatalogCard({
  enabledSlugs,
  filteredSkills,
  isLoading,
  isTogglingSkill,
  modalityFilter,
  onModalityFilterChange,
  onSkillSelect,
  onStageFilterChange,
  onToggleSkill,
  selectedSkillId,
  stageFilter,
}: Props) {
  const translate = useTranslations('common.settings.skills');

  return (
    <Card bodyClassName="gap-0 p-5" className="rounded-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            {translate('catalog.title')}
          </h2>
          <p className="text-sm text-foreground/55">
            {translate('catalog.description')}
          </p>
        </div>
      </div>

      <div className="mb-4 space-y-2">
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">
            {translate('filters.modality.label')}
          </legend>
          {MODALITY_FILTERS.map((filter) => (
            <Button
              aria-pressed={modalityFilter === filter.value}
              className="rounded-full"
              key={filter.value}
              onClick={() => onModalityFilterChange(filter.value)}
              variant={
                modalityFilter === filter.value
                  ? ButtonVariant.DEFAULT
                  : ButtonVariant.SECONDARY
              }
            >
              {translate(`filters.modality.${filter.labelKey}`)}
            </Button>
          ))}
        </fieldset>
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">
            {translate('filters.stage.label')}
          </legend>
          {STAGE_FILTERS.map((filter) => (
            <Button
              aria-pressed={stageFilter === filter.value}
              className="rounded-full"
              key={filter.value}
              onClick={() => onStageFilterChange(filter.value)}
              variant={
                stageFilter === filter.value
                  ? ButtonVariant.DEFAULT
                  : ButtonVariant.SECONDARY
              }
            >
              {translate(`filters.stage.${filter.labelKey}`)}
            </Button>
          ))}
        </fieldset>
      </div>

      <div className="grid gap-3">
        {isLoading ? (
          <InsetSurface className="text-sm text-foreground/55">
            {translate('catalog.loading')}
          </InsetSurface>
        ) : null}

        {!isLoading && filteredSkills.length === 0 ? (
          <InsetSurface className="text-sm text-foreground/55">
            {translate('catalog.empty')}
          </InsetSurface>
        ) : null}

        {filteredSkills.map((skill) => {
          const isSelected = selectedSkillId === skill.id;
          const isEnabled = enabledSlugs.includes(skill.slug);

          return (
            <div
              className={`relative rounded-2xl ${
                isSelected ? 'bg-tertiary' : 'hover:bg-tertiary/60'
              } ${!isEnabled ? 'opacity-50' : ''}`}
              key={skill.id}
            >
              <Button
                aria-pressed={isSelected}
                className="h-auto w-full flex-col items-stretch rounded-2xl p-4 pr-16 text-left"
                onClick={() => onSkillSelect(skill.id)}
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
              >
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {skill.name}
                  </span>
                  <Badge
                    className="px-2 py-1 text-2xs uppercase tracking-[0.14em]"
                    variant={getSourceBadgeVariant(skill.source)}
                  >
                    {skill.source.replace('_', ' ')}
                  </Badge>
                  <Badge
                    className="px-2 py-1 text-2xs uppercase tracking-[0.14em]"
                    variant="ghost"
                  >
                    {skill.workflowStage}
                  </Badge>
                </div>

                <p className="mb-3 text-sm text-foreground/65">
                  {skill.description}
                </p>

                <div className="flex flex-wrap gap-2 text-2xs uppercase tracking-[0.14em] text-foreground/45">
                  {skill.modalities.map((modality) => (
                    <Badge
                      className="px-2 py-1 text-2xs uppercase tracking-[0.14em]"
                      key={`${skill.id}-${modality}`}
                      variant={getModalityBadgeVariant(modality)}
                    >
                      {modality}
                    </Badge>
                  ))}
                  {skill.channels.map((channel) => (
                    <Badge
                      className="px-2 py-1 text-2xs uppercase tracking-[0.14em]"
                      key={`${skill.id}-${channel}`}
                      variant="outline"
                    >
                      {channel}
                    </Badge>
                  ))}
                </div>
              </Button>
              <Switch
                aria-label={translate('catalog.enableSkill', {
                  name: skill.name,
                })}
                checked={isEnabled}
                className="absolute top-4 right-4"
                isDisabled={isTogglingSkill}
                onCheckedChange={() => onToggleSkill(skill.slug)}
              />
            </div>
          );
        })}
      </div>
    </Card>
  );
}
