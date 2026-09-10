'use client';

import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/contracts';
import { cdnProductStill } from '@helpers/media/cdn/cdn.helper';
import type { ContentTeamRolePreset } from '@pages/agents/content-team/content-team-presets';
import { CONTENT_TEAM_ROLE_PRESETS } from '@pages/agents/content-team/content-team-presets';
import type { AgentMarketplaceProps } from '@props/automation/agent-marketplace.props';
import Card from '@ui/card/Card';
import { ListRow } from '@ui/lists/list-row/ListRow';
import { Button } from '@ui/primitives/button';
import FormSearchbar from '@ui/primitives/searchbar';
import NextImage from 'next/image';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  type AgentTypeIcon,
  getAgentTypeIcon,
} from '../agents/agent-type-display';

const ALL_CATEGORY = 'all';
const FEATURED_COUNT = 4;
const FEATURED_AVATAR_SIZE = 40;
const LIST_AVATAR_SIZE = 36;

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

function AgentPresetAvatar({
  fallbackIcon: FallbackIcon,
  presetId,
  size,
}: {
  fallbackIcon: AgentTypeIcon;
  presetId: string;
  size: number;
}) {
  const [hasFailed, setHasFailed] = useState(false);

  if (hasFailed) {
    return <FallbackIcon className="size-4 text-foreground/70" />;
  }

  return (
    <NextImage
      alt=""
      className="rounded-md object-cover"
      height={size}
      onError={() => setHasFailed(true)}
      src={cdnProductStill('agents', presetId)}
      width={size}
    />
  );
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

      {featuredPresets.length > 0 ? (
        <section>
          <p className="mb-3 text-sm font-semibold text-foreground">
            {translate('featured')}
          </p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {featuredPresets.map((preset) => {
              const Icon = getAgentTypeIcon(preset.type);
              const isActivating = submittingPresetId === preset.id;
              return (
                <Card
                  key={`featured-${preset.id}`}
                  className="h-full"
                  data-testid={`agent-preset-featured-${preset.id}`}
                  description={preset.description}
                  icon={
                    <AgentPresetAvatar
                      fallbackIcon={Icon}
                      presetId={preset.id}
                      size={FEATURED_AVATAR_SIZE}
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
          </div>
        </section>
      ) : null}

      <section>
        {featuredPresets.length > 0 ? (
          <p className="mb-3 text-sm font-semibold text-foreground">
            {translate('allAgents')}
          </p>
        ) : null}
        <div className="overflow-hidden rounded-card border border-border">
          {visiblePresets.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-foreground/50">
              {translate('emptySearch')}
            </p>
          ) : (
            visiblePresets.map((preset) => {
              const Icon = getAgentTypeIcon(preset.type);
              const isActivating = submittingPresetId === preset.id;
              return (
                <ListRow
                  key={preset.id}
                  data-testid={`agent-preset-row-${preset.id}`}
                  density="compact"
                  description={preset.description}
                  leading={
                    <span className="flex size-9 items-center justify-center overflow-hidden rounded-md bg-foreground/5">
                      <AgentPresetAvatar
                        fallbackIcon={Icon}
                        presetId={preset.id}
                        size={LIST_AVATAR_SIZE}
                      />
                    </span>
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
            })
          )}
        </div>
      </section>
    </div>
  );
}
