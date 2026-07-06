'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type { Skill } from '@services/content/skills.service';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import InsetSurface from '@ui/display/inset-surface/InsetSurface';
import { Button } from '@ui/primitives/button';
import { Switch } from '@ui/primitives/switch';
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
  modalityFilter,
  onModalityFilterChange,
  onSkillSelect,
  onStageFilterChange,
  onToggleSkill,
  selectedSkillId,
  stageFilter,
}: Props) {
  return (
    <Card bodyClassName="gap-0 p-5" className="rounded-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Catalog</h2>
          <p className="text-sm text-foreground/55">
            Browse built-in, imported, and brand-editable content skills.
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {MODALITY_FILTERS.map((filter) => (
          <Button
            className="rounded-full"
            key={filter.value}
            onClick={() => onModalityFilterChange(filter.value)}
            variant={
              modalityFilter === filter.value
                ? ButtonVariant.DEFAULT
                : ButtonVariant.OUTLINE
            }
          >
            {filter.label}
          </Button>
        ))}
        {STAGE_FILTERS.map((filter) => (
          <Button
            className="rounded-full"
            key={filter.value}
            onClick={() => onStageFilterChange(filter.value)}
            variant={
              stageFilter === filter.value
                ? ButtonVariant.DEFAULT
                : ButtonVariant.OUTLINE
            }
          >
            {filter.label}
          </Button>
        ))}
      </div>

      <div className="grid gap-3">
        {isLoading ? (
          <InsetSurface className="text-sm text-foreground/55">
            Loading skill catalog…
          </InsetSurface>
        ) : null}

        {!isLoading && filteredSkills.length === 0 ? (
          <InsetSurface className="text-sm text-foreground/55">
            No skills match the current filters.
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
                    className="px-2 py-1 text-[11px] uppercase tracking-[0.14em]"
                    variant={getSourceBadgeVariant(skill.source)}
                  >
                    {skill.source.replace('_', ' ')}
                  </Badge>
                  <Badge
                    className="px-2 py-1 text-[11px] uppercase tracking-[0.14em]"
                    variant="ghost"
                  >
                    {skill.workflowStage}
                  </Badge>
                </div>

                <p className="mb-3 text-sm text-foreground/65">
                  {skill.description}
                </p>

                <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.14em] text-foreground/45">
                  {skill.modalities.map((modality) => (
                    <Badge
                      className="px-2 py-1 text-[11px] uppercase tracking-[0.14em]"
                      key={`${skill.id}-${modality}`}
                      variant={getModalityBadgeVariant(modality)}
                    >
                      {modality}
                    </Badge>
                  ))}
                  {skill.channels.map((channel) => (
                    <Badge
                      className="px-2 py-1 text-[11px] uppercase tracking-[0.14em]"
                      key={`${skill.id}-${channel}`}
                      variant="outline"
                    >
                      {channel}
                    </Badge>
                  ))}
                </div>
              </Button>
              <Switch
                checked={isEnabled}
                className="absolute top-4 right-4"
                onCheckedChange={() => onToggleSkill(skill.slug)}
              />
            </div>
          );
        })}
      </div>
    </Card>
  );
}
