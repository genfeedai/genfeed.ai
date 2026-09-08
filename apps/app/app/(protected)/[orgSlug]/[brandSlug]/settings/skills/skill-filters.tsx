import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/contracts';
import type { SkillFiltersProps } from '@props/settings/skills.props';
import { Button } from '@ui/primitives/button';
import { fieldControlClassName } from '@ui/primitives/field-control';
import FormSearchbar from '@ui/primitives/searchbar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { RefreshCw, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import {
  MODALITY_FILTERS,
  SOURCE_FILTERS,
  STAGE_FILTERS,
} from './skill-filter-options';

export default function SkillFilters({
  agentHref,
  modalityFilter,
  onModalityFilterChange,
  onRefresh,
  onSearchQueryChange,
  onSourceFilterChange,
  onStageFilterChange,
  searchQuery,
  sourceFilter,
  stageFilter,
}: SkillFiltersProps) {
  const translate = useTranslations('common.settings.skills');

  return (
    <div className="flex flex-wrap items-center justify-end gap-2.5">
      <FormSearchbar
        ariaLabel={translate('filters.search.label')}
        className="w-48"
        inputClassName={`${fieldControlClassName} pl-10 pr-8`}
        onChange={(event) => onSearchQueryChange(event.target.value)}
        placeholder={translate('filters.search.placeholder')}
        size={ComponentSize.SM}
        value={searchQuery}
      />

      <Select onValueChange={onSourceFilterChange} value={sourceFilter}>
        <SelectTrigger
          aria-label={translate('filters.source.label')}
          className="h-8 w-32"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SOURCE_FILTERS.map((filter) => (
            <SelectItem key={filter.value} value={filter.value}>
              {translate(`filters.source.${filter.labelKey}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select onValueChange={onModalityFilterChange} value={modalityFilter}>
        <SelectTrigger
          aria-label={translate('filters.modality.label')}
          className="h-8 w-32"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MODALITY_FILTERS.map((filter) => (
            <SelectItem key={filter.value} value={filter.value}>
              {translate(`filters.modality.${filter.labelKey}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select onValueChange={onStageFilterChange} value={stageFilter}>
        <SelectTrigger
          aria-label={translate('filters.stage.label')}
          className="h-8 w-32"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STAGE_FILTERS.map((filter) => (
            <SelectItem key={filter.value} value={filter.value}>
              {translate(`filters.stage.${filter.labelKey}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        icon={<RefreshCw className="size-4" />}
        label={translate('actions.refresh')}
        onClick={onRefresh}
        size={ButtonSize.SM}
        variant={ButtonVariant.SECONDARY}
      />
      <Button
        asChild
        size={ButtonSize.SM}
        variant={ButtonVariant.DEFAULT}
        withWrapper={false}
      >
        <Link href={agentHref}>
          <Sparkles className="size-4" />
          {translate('actions.openAgent')}
        </Link>
      </Button>
    </div>
  );
}
