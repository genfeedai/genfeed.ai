'use client';

import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/contracts';
import type { ContentTeamRolePreset } from '@pages/agents/content-team/content-team-presets';
import { CONTENT_TEAM_ROLE_PRESETS } from '@pages/agents/content-team/content-team-presets';
import type { AgentMarketplaceProps } from '@props/automation/agent-marketplace.props';
import Card from '@ui/card/Card';
import CollectionCarouselSection from '@ui/collection/CollectionCarouselSection';
import CollectionList from '@ui/collection/CollectionList';
import CollectionSection from '@ui/collection/CollectionSection';
import { ListRow } from '@ui/lists/list-row/ListRow';
import { Button } from '@ui/primitives/button';
import FormSearchbar from '@ui/primitives/searchbar';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import AgentPresetAvatar from './AgentPresetAvatar';

const ALL_CATEGORY = 'all';
const FEATURED_COUNT = 4;

function matchesQuery(preset: ContentTeamRolePreset, query: string): boolean {
  if (!query) {
    return true;
  }
  const haystack = [
    preset.displayRole,
    preset.defaultLabel,
    preset.description,
    preset.teamGroup,
    ...preset.platforms,
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

function comparePresetName(
  left: ContentTeamRolePreset,
  right: ContentTeamRolePreset,
): number {
  return left.displayRole.localeCompare(right.displayRole);
}

export default function AgentMarketplace({
  isSubmitting,
  onActivate,
  submittingPresetId,
}: AgentMarketplaceProps) {
  const translate = useTranslations('common.automation.agentCreation');
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState(ALL_CATEGORY);
  const query = searchQuery.trim().toLowerCase();

  const categories = useMemo(() => {
    const groups = [
      ...new Set(CONTENT_TEAM_ROLE_PRESETS.map((preset) => preset.teamGroup)),
    ].sort();
    return [ALL_CATEGORY, ...groups];
  }, []);

  const visiblePresets = useMemo(
    () =>
      CONTENT_TEAM_ROLE_PRESETS.filter((preset) => {
        if (category !== ALL_CATEGORY && preset.teamGroup !== category) {
          return false;
        }
        return matchesQuery(preset, query);
      }).sort(comparePresetName),
    [category, query],
  );

  const featuredPresets = query ? [] : visiblePresets.slice(0, FEATURED_COUNT);
  // Featured presets already sit in the carousel; the list holds the rest.
  const listedPresets = visiblePresets.slice(featuredPresets.length);

  return (
    <div className="flex flex-col gap-6" data-testid="agent-marketplace">
      <FormSearchbar
        ariaLabel={translate('search')}
        className="w-full"
        onChange={(event) => setSearchQuery(event.target.value)}
        onClear={() => setSearchQuery('')}
        placeholder={translate('search')}
        size={ComponentSize.SM}
        value={searchQuery}
      />

      <div className="flex flex-wrap gap-2">
        {categories.map((item) => (
          <Button
            key={item}
            aria-pressed={category === item}
            size={ButtonSize.SM}
            variant={
              category === item
                ? ButtonVariant.DEFAULT
                : ButtonVariant.SECONDARY
            }
            onClick={() => setCategory(item)}
          >
            {item === ALL_CATEGORY ? translate('all') : item}
          </Button>
        ))}
      </div>

      <CollectionCarouselSection
        gap="md"
        data-testid="agent-marketplace-featured"
        itemCount={featuredPresets.length}
        title={translate('featured')}
      >
        {featuredPresets.map((preset) => {
          const isActivating = submittingPresetId === preset.id;
          return (
            <Card
              key={`featured-${preset.id}`}
              className="w-64 shrink-0"
              data-testid={`agent-preset-featured-${preset.id}`}
              description={preset.description}
              icon={
                <AgentPresetAvatar
                  platforms={preset.platforms}
                  presetId={preset.id}
                  type={preset.type}
                />
              }
              iconWrapperClassName="bg-transparent p-0"
              isDisabled={isSubmitting}
              label={preset.displayRole}
              onClick={() => {
                if (!isSubmitting) {
                  void onActivate(preset.id);
                }
              }}
            >
              <p className="text-xs text-foreground/45">
                {isActivating
                  ? translate('activating')
                  : translate('creditsPerDay', {
                      credits: preset.defaultBudget,
                    })}
              </p>
            </Card>
          );
        })}
      </CollectionCarouselSection>

      {visiblePresets.length === 0 ? (
        <p className="py-8 text-center text-sm text-foreground/50">
          {translate('emptySearch')}
        </p>
      ) : null}

      <CollectionSection
        data-testid="agent-marketplace-list"
        itemCount={listedPresets.length}
        title={
          featuredPresets.length > 0
            ? translate('moreAgents')
            : translate('allAgents')
        }
      >
        <CollectionList>
          {listedPresets.map((preset) => {
            const isActivating = submittingPresetId === preset.id;
            return (
              <ListRow
                key={preset.id}
                data-testid={`agent-preset-row-${preset.id}`}
                density="compact"
                description={preset.description}
                leading={
                  <AgentPresetAvatar
                    platforms={preset.platforms}
                    presetId={preset.id}
                    type={preset.type}
                  />
                }
                meta={`${preset.teamGroup} · ${translate('creditsPerDay', {
                  credits: preset.defaultBudget,
                })}`}
                title={preset.displayRole}
                trailing={
                  <Button
                    data-testid={`activate-${preset.id}`}
                    isDisabled={isSubmitting}
                    isLoading={isActivating}
                    label={
                      isActivating
                        ? translate('activating')
                        : translate('activate')
                    }
                    onClick={() => {
                      void onActivate(preset.id);
                    }}
                    size={ButtonSize.SM}
                    variant={ButtonVariant.DEFAULT}
                  />
                }
              />
            );
          })}
        </CollectionList>
      </CollectionSection>
    </div>
  );
}
