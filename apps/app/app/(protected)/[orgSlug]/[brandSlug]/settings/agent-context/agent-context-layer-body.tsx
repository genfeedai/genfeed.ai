'use client';

import type {
  AgentContextFieldRow,
  AgentContextLayerBodyProps,
} from '@props/settings/agent-context.props';
import { Badge } from '@ui/primitives/badge';
import {
  DefinitionDetail,
  DefinitionList,
  DefinitionTerm,
} from '@ui/primitives/definition-list';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

function joinValues(values: string[] | undefined): string | undefined {
  return values && values.length > 0 ? values.join(', ') : undefined;
}

function Fields({ rows }: { rows: AgentContextFieldRow[] }) {
  const visible = rows.filter(
    (row) => row.value !== undefined && row.value !== null && row.value !== '',
  );
  return (
    <DefinitionList className="grid gap-x-4 gap-y-2 sm:grid-cols-[10rem_minmax(0,1fr)]">
      {visible.map((row) => (
        <div className="contents" key={row.key}>
          <DefinitionTerm className="text-xs text-muted-foreground">
            {row.label}
          </DefinitionTerm>
          <DefinitionDetail className="text-sm whitespace-pre-wrap break-words">
            {row.value}
          </DefinitionDetail>
        </div>
      ))}
    </DefinitionList>
  );
}

function Lines({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
      {items.map((item, index) => (
        // Rendered rows are positional snapshots with no stable identity.
        // biome-ignore lint/suspicious/noArrayIndexKey: read-only snapshot list
        <li className="break-words" key={index}>
          {item}
        </li>
      ))}
    </ul>
  );
}

/** Renders what the agent sees for one context layer. */
export default function AgentContextLayerBody({
  layerKey,
  layers,
  systemPrompt,
}: AgentContextLayerBodyProps) {
  const translate = useTranslations('pages.brandAgentContext');
  const field = (key: string) => translate(`fields.${key}`);

  switch (layerKey) {
    case 'identity':
      return (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">{layers.identity.name}</p>
          {layers.identity.description ? (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {layers.identity.description}
            </p>
          ) : null}
        </div>
      );
    case 'guidelines':
      return (
        <p className="text-sm whitespace-pre-wrap break-words">
          {layers.guidelines}
        </p>
      );
    case 'persona':
      return (
        <p className="text-sm whitespace-pre-wrap break-words">
          {layers.persona}
        </p>
      );
    case 'visualIdentity': {
      const visual = layers.visualIdentity;
      const colors = [
        visual?.primaryColor,
        visual?.secondaryColor,
        visual?.backgroundColor,
      ].filter((color): color is string => Boolean(color));
      return (
        <Fields
          rows={[
            {
              key: 'colors',
              label: field('colors'),
              value: colors.length ? (
                <span className="flex flex-wrap items-center gap-2">
                  {colors.map((color) => (
                    <span className="flex items-center gap-1" key={color}>
                      <span
                        aria-hidden="true"
                        className="inline-block size-3 rounded-sm border border-border"
                        style={{ backgroundColor: color }}
                      />
                      {color}
                    </span>
                  ))}
                </span>
              ) : undefined,
            },
            { key: 'font', label: field('font'), value: visual?.fontFamily },
            {
              key: 'referenceImages',
              label: field('referenceImages'),
              value: visual?.referenceImageCount
                ? String(visual.referenceImageCount)
                : undefined,
            },
          ]}
        />
      );
    }
    case 'voice': {
      const voice = layers.voice;
      return (
        <Fields
          rows={[
            { key: 'tone', label: field('tone'), value: voice?.tone },
            { key: 'style', label: field('style'), value: voice?.style },
            {
              key: 'audience',
              label: field('audience'),
              value: voice?.audience,
            },
            {
              key: 'messagingPillars',
              label: field('messagingPillars'),
              value: joinValues(voice?.messagingPillars),
            },
            {
              key: 'values',
              label: field('values'),
              value: joinValues(voice?.values),
            },
            {
              key: 'doNotSoundLike',
              label: field('doNotSoundLike'),
              value: joinValues(voice?.doNotSoundLike),
            },
            {
              key: 'approvedHooks',
              label: field('approvedHooks'),
              value: joinValues(voice?.approvedHooks),
            },
            {
              key: 'bannedPhrases',
              label: field('bannedPhrases'),
              value: joinValues(voice?.bannedPhrases),
            },
            {
              key: 'writingRules',
              label: field('writingRules'),
              value: voice?.writingRules.length ? (
                <Lines items={voice.writingRules} />
              ) : undefined,
            },
            {
              key: 'taglines',
              label: field('taglines'),
              value: joinValues(voice?.taglines),
            },
            {
              key: 'hashtags',
              label: field('hashtags'),
              value: voice?.hashtags.length
                ? voice.hashtags.join(' ')
                : undefined,
            },
            {
              key: 'sampleOutput',
              label: field('sampleOutput'),
              value: voice?.sampleOutput,
            },
            {
              key: 'exemplars',
              label: field('exemplars'),
              value: voice?.exemplarTexts.length ? (
                <Lines items={voice.exemplarTexts} />
              ) : undefined,
            },
          ]}
        />
      );
    }
    case 'strategy': {
      const strategy = layers.strategy;
      const topics = strategy?.topics ?? [];
      const areTopicsInjected =
        topics.length > 0 &&
        topics.every((topic) => systemPrompt.includes(topic));
      return (
        <Fields
          rows={[
            {
              key: 'goals',
              label: field('goals'),
              value: joinValues(strategy?.goals),
            },
            {
              key: 'topics',
              label: field('topics'),
              value: topics.length ? (
                <span className="flex flex-col gap-1">
                  <span>{topics.join(', ')}</span>
                  {areTopicsInjected ? null : (
                    <span className="text-xs text-muted-foreground">
                      {field('topicsNotInjected')}
                    </span>
                  )}
                </span>
              ) : undefined,
            },
            {
              key: 'contentTypes',
              label: field('contentTypes'),
              value: joinValues(strategy?.contentTypes),
            },
            {
              key: 'platforms',
              label: field('platforms'),
              value: joinValues(strategy?.platforms),
            },
            {
              key: 'frequency',
              label: field('frequency'),
              value: strategy?.frequency,
            },
          ]}
        />
      );
    }
    case 'prompting':
      return (
        <Fields
          rows={[
            {
              key: 'seeds',
              label: field('seeds'),
              value: layers.prompting.seeds.length ? (
                <Lines
                  items={layers.prompting.seeds.map(
                    (seed) =>
                      `${seed.topic}: ${seed.angle}${
                        seed.audience ? ` (${seed.audience})` : ''
                      }`,
                  )}
                />
              ) : undefined,
            },
            {
              key: 'conversationStarters',
              label: field('conversationStarters'),
              value: layers.prompting.conversationStarters.length ? (
                <Lines
                  items={layers.prompting.conversationStarters.map(
                    (starter) => (
                      <span
                        className="flex flex-wrap items-center gap-2"
                        key={starter.id}
                      >
                        <Badge variant="outline">{starter.intent}</Badge>
                        <span className="font-medium">{starter.label}</span>
                        <span className="text-muted-foreground">
                          {starter.prompt}
                        </span>
                      </span>
                    ),
                  )}
                />
              ) : undefined,
            },
          ]}
        />
      );
    case 'performanceInsights':
      return (
        <Lines
          items={layers.performanceInsights.map(
            (insight) => `[${insight.category}] ${insight.insight}`,
          )}
        />
      );
    case 'patterns':
      return (
        <Lines
          items={layers.patterns.map(
            (pattern) =>
              `[${pattern.patternType}] ${pattern.formula || pattern.label} (${pattern.avgPerformanceScore})`,
          )}
        />
      );
    case 'knowledge':
      return (
        <div className="flex flex-col gap-3">
          {layers.knowledge.map((entry, index) => (
            <div
              className="flex flex-col gap-1 border-l-2 border-border pl-3"
              // biome-ignore lint/suspicious/noArrayIndexKey: retrieval order is the identity
              key={`${entry.sourceId ?? entry.source}-${index}`}
            >
              <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">
                  {translate(`origin.${entry.origin}`)}
                </Badge>
                <span>{entry.source}</span>
                {entry.sourceId ? (
                  <span className="font-mono">{entry.sourceId}</span>
                ) : null}
              </span>
              <p className="text-sm whitespace-pre-wrap break-words">
                {entry.content}
              </p>
            </div>
          ))}
        </div>
      );
    case 'recentPosts':
      return <Lines items={layers.recentPosts} />;
    default:
      return null;
  }
}
