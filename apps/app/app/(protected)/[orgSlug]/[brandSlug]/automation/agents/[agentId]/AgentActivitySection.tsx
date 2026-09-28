'use client';

import { AgentActivityFeed } from '@genfeedai/agent/components/AgentActivityFeed';
import type {
  IAgentStrategyRunHistoryItem,
  IWorkflowExecution,
} from '@genfeedai/contracts/interfaces';
import CollectionSection from '@ui/collection/CollectionSection';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import AgentPerformanceSection from './AgentPerformanceSection';
import AgentWorkSection from './AgentWorkSection';
import WorkflowExecutionHistorySection from './WorkflowExecutionHistorySection';

export type AgentActivityFilter = 'all' | 'content' | 'performance' | 'runs';

export interface AgentActivitySectionProps {
  agentId: string;
  runHistory: IAgentStrategyRunHistoryItem[];
  executions: IWorkflowExecution[];
  isExecutionsLoading: boolean;
  isExecutionsError: boolean;
  executionsErrorMessage: string;
  expandedExecutionId: string | null;
  onToggleExpandExecution: (executionId: string) => void;
  getThreadHref: (threadId: string) => string;
  getExecutionHref: (executionId: string) => string;
}

/**
 * One Activity section with a single filter, replacing three always-visible
 * stacked sections (content, performance, runs) with a filter that shows
 * exactly the slice the viewer picked (#5483). Every underlying query and its
 * loading/error/empty behavior is unchanged — this is a layout consolidation,
 * not a new data source.
 */
export default function AgentActivitySection({
  agentId,
  runHistory,
  executions,
  isExecutionsLoading,
  isExecutionsError,
  executionsErrorMessage,
  expandedExecutionId,
  onToggleExpandExecution,
  getThreadHref,
  getExecutionHref,
}: AgentActivitySectionProps) {
  const translate = useTranslations('ui.recordDetail');
  const [filter, setFilter] = useState<AgentActivityFilter>('all');

  const showContent = filter === 'all' || filter === 'content';
  const showPerformance = filter === 'all' || filter === 'performance';
  const showRuns = filter === 'all' || filter === 'runs';

  return (
    <CollectionSection
      actions={
        <Select
          onValueChange={(value) => setFilter(value as AgentActivityFilter)}
          value={filter}
        >
          <SelectTrigger
            aria-label={translate('activityFilterAria')}
            className="w-40"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {translate('activityFilterAll')}
            </SelectItem>
            <SelectItem value="content">
              {translate('activityFilterContent')}
            </SelectItem>
            <SelectItem value="performance">
              {translate('activityFilterReports')}
            </SelectItem>
            <SelectItem value="runs">
              {translate('activityFilterRuns')}
            </SelectItem>
          </SelectContent>
        </Select>
      }
      title={translate('activity')}
    >
      <div className="space-y-6">
        {showContent ? <AgentWorkSection agentId={agentId} /> : null}
        {showPerformance ? <AgentPerformanceSection agentId={agentId} /> : null}
        {showRuns ? (
          <>
            <AgentActivityFeed
              getExecutionHref={getExecutionHref}
              getThreadHref={getThreadHref}
              runHistory={runHistory}
            />
            {isExecutionsError ? (
              <p className="text-sm text-destructive" role="alert">
                {executionsErrorMessage}
              </p>
            ) : (
              <WorkflowExecutionHistorySection
                executions={executions}
                expandedExecutionId={expandedExecutionId}
                isLoading={isExecutionsLoading}
                onToggleExpand={onToggleExpandExecution}
              />
            )}
          </>
        ) : null}
      </div>
    </CollectionSection>
  );
}
