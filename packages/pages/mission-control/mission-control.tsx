'use client';

import {
  AGENT_RUN_SORT_MODES,
  AGENT_RUN_TIME_RANGES,
  type AgentRunSortMode,
  type AgentRunTimeRange,
  DEFAULT_AGENT_RUN_SORT_MODE,
  DEFAULT_AGENT_RUN_TIME_RANGE,
} from '@genfeedai/types';
import { ComponentSize } from '@genfeedai/enums';
import { useActiveAgentRuns } from '@hooks/data/agent-runs/use-active-agent-runs';
import { useAgentRuns } from '@hooks/data/agent-runs/use-agent-runs';
import ActiveRunsPanel from '@pages/mission-control/components/ActiveRunsPanel';
import RunAnomaliesPanel from '@pages/mission-control/components/RunAnomaliesPanel';
import RunHistoryList from '@pages/mission-control/components/RunHistoryList';
import RunRoutingInsights from '@pages/mission-control/components/RunRoutingInsights';
import RunStatsStrip from '@pages/mission-control/components/RunStatsStrip';
import RunTrendsPanel from '@pages/mission-control/components/RunTrendsPanel';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import FormSearchbar from '@ui/forms/inputs/searchbar/form-searchbar/FormSearchbar';
import FormSelect from '@ui/forms/selectors/select/form-select/FormSelect';
import Container from '@ui/layout/container/Container';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

function getMetadataString(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : undefined;
}

function parseSortMode(value: string | null): AgentRunSortMode {
  return AGENT_RUN_SORT_MODES.includes(value as AgentRunSortMode)
    ? (value as AgentRunSortMode)
    : DEFAULT_AGENT_RUN_SORT_MODE;
}

function parseTimeRange(value: string | null): AgentRunTimeRange {
  return AGENT_RUN_TIME_RANGES.includes(value as AgentRunTimeRange)
    ? (value as AgentRunTimeRange)
    : DEFAULT_AGENT_RUN_TIME_RANGE;
}

export default function MissionControl() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [searchQuery, setSearchQuery] = useState(
    () => searchParams.get('q') ?? '',
  );
  const [selectedModel, setSelectedModel] = useState(
    () => searchParams.get('model') ?? 'all',
  );
  const [sortMode, setSortMode] = useState<AgentRunSortMode>(() =>
    parseSortMode(searchParams.get('sort')),
  );
  const [timeRange, setTimeRange] = useState<AgentRunTimeRange>(() =>
    parseTimeRange(searchParams.get('range')),
  );

  const { runs, stats, isLoading, refresh, cancelRun } = useAgentRuns({
    historyOnly: true,
    model: selectedModel === 'all' ? undefined : selectedModel,
    q: searchQuery.trim() || undefined,
    sortMode,
    timeRange,
  });
  const { activeRuns, refresh: refreshActive } = useActiveAgentRuns();

  const refreshAll = useCallback(async () => {
    await Promise.all([refresh(), refreshActive()]);
  }, [refresh, refreshActive]);

  useEffect(() => {
    const nextParams = new URLSearchParams(searchParams.toString());

    if (searchQuery.trim().length > 0) {
      nextParams.set('q', searchQuery.trim());
    } else {
      nextParams.delete('q');
    }

    if (selectedModel !== 'all') {
      nextParams.set('model', selectedModel);
    } else {
      nextParams.delete('model');
    }

    if (sortMode !== DEFAULT_AGENT_RUN_SORT_MODE) {
      nextParams.set('sort', sortMode);
    } else {
      nextParams.delete('sort');
    }

    if (timeRange !== DEFAULT_AGENT_RUN_TIME_RANGE) {
      nextParams.set('range', timeRange);
    } else {
      nextParams.delete('range');
    }

    const nextQuery = nextParams.toString();
    const currentQuery = searchParams.toString();

    if (nextQuery !== currentQuery) {
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
        scroll: false,
      });
    }
  }, [
    pathname,
    router,
    searchParams,
    searchQuery,
    selectedModel,
    sortMode,
    timeRange,
  ]);

  const availableModels = useMemo(
    () =>
      Array.from(
        new Set([
          ...runs.flatMap((run) => {
            const requestedModel = getMetadataString(
              run.metadata,
              'requestedModel',
            );
            const actualModel = getMetadataString(run.metadata, 'actualModel');

            return [requestedModel, actualModel].filter(
              (model): model is string => Boolean(model),
            );
          }),
          ...(stats?.topActualModels ?? []).map((entry) => entry.model),
          ...(stats?.topRequestedModels ?? []).map((entry) => entry.model),
          ...(selectedModel !== 'all' ? [selectedModel] : []),
        ]),
      )
        .filter((model) => model !== 'all')
        .sort((left, right) => left.localeCompare(right)),
    [runs, selectedModel, stats?.topActualModels, stats?.topRequestedModels],
  );

  return (
    <Container>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Agent Runs</h1>
          <ButtonRefresh onClick={refreshAll} />
        </div>

        <RunStatsStrip stats={stats} isLoading={isLoading} />

        <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
          <RunTrendsPanel stats={stats} />
          <RunAnomaliesPanel stats={stats} />
        </div>

        <RunRoutingInsights stats={stats} />

        <ActiveRunsPanel runs={activeRuns} onCancel={cancelRun} />

        <div className="grid gap-3 md:grid-cols-4">
          <FormSearchbar
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search runs, objectives, or routing"
            className="w-full"
            inputClassName="gen-card min-h-11 bg-transparent px-3 text-sm"
            size={ComponentSize.MD}
          />
          <FormSelect
            name="model"
            value={selectedModel}
            onChange={(event) => setSelectedModel(event.target.value)}
            className="gen-card min-h-11 bg-transparent px-3 text-sm"
            placeholder=""
          >
            <option value="all">All models</option>
            {availableModels.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </FormSelect>
          <FormSelect
            name="sortMode"
            value={sortMode}
            onChange={(event) => setSortMode(parseSortMode(event.target.value))}
            className="gen-card min-h-11 bg-transparent px-3 text-sm"
            placeholder=""
          >
            <option value="latest">Sort: Latest</option>
            <option value="credits">Sort: Credits</option>
            <option value="duration">Sort: Duration</option>
            <option value="model">Sort: Model</option>
          </FormSelect>
          <FormSelect
            name="timeRange"
            value={timeRange}
            onChange={(event) =>
              setTimeRange(parseTimeRange(event.target.value))
            }
            className="gen-card min-h-11 bg-transparent px-3 text-sm"
            placeholder=""
          >
            <option value="7d">Window: 7d</option>
            <option value="14d">Window: 14d</option>
            <option value="30d">Window: 30d</option>
          </FormSelect>
        </div>

        <RunHistoryList runs={runs} isLoading={isLoading} />
      </div>
    </Container>
  );
}
