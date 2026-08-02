'use client';

import {
  DefinitionDetail,
  DefinitionList,
  DefinitionTerm,
} from '@genfeedai/ui';
import type { AgentStrategyOpportunity } from '@services/automation/agent-strategies.service';
import Badge from '@ui/display/badge/Badge';
import InsetSurface from '@ui/display/inset-surface/InsetSurface';

type AgentOpportunityPanelProps = {
  requestedOpportunityId: string;
  selectedOpportunity: AgentStrategyOpportunity | null;
  isOpportunitiesLoading: boolean;
};

export default function AgentOpportunityPanel({
  requestedOpportunityId,
  selectedOpportunity,
  isOpportunitiesLoading,
}: AgentOpportunityPanelProps) {
  return (
    <InsetSurface className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-medium text-foreground">
            Review context
          </h3>
          <p className="mt-1 text-sm text-foreground/55">
            Opened from the publishing inbox with autopilot opportunity context.
          </p>
        </div>
        <Badge variant="secondary">
          {selectedOpportunity?.sourceType ?? 'Loading'}
        </Badge>
      </div>

      <DefinitionList
        variant="grid"
        className="mt-4 gap-3 text-sm md:grid-cols-2"
      >
        <InsetSurface className="p-3" density="compact" tone="contrast">
          <DefinitionTerm>Opportunity</DefinitionTerm>
          <DefinitionDetail
            variant="inline"
            className="mt-1 text-foreground/85"
          >
            {selectedOpportunity?.topic ??
              (isOpportunitiesLoading
                ? 'Loading opportunity...'
                : requestedOpportunityId)}
          </DefinitionDetail>
        </InsetSurface>
        <InsetSurface className="p-3" density="compact" tone="contrast">
          <DefinitionTerm>Status</DefinitionTerm>
          <DefinitionDetail
            variant="inline"
            className="mt-1 capitalize text-foreground/85"
          >
            {selectedOpportunity?.status ??
              (isOpportunitiesLoading ? 'Loading' : 'Unavailable')}
          </DefinitionDetail>
        </InsetSurface>
        <InsetSurface className="p-3" density="compact" tone="contrast">
          <DefinitionTerm>Reason</DefinitionTerm>
          <DefinitionDetail
            variant="inline"
            className="mt-1 text-foreground/85"
          >
            {selectedOpportunity?.decisionReason ?? 'Not recorded'}
          </DefinitionDetail>
        </InsetSurface>
        <InsetSurface className="p-3" density="compact" tone="contrast">
          <DefinitionTerm>Expected traffic</DefinitionTerm>
          <DefinitionDetail
            variant="inline"
            className="mt-1 text-foreground/85"
          >
            {selectedOpportunity?.expectedTrafficScore ?? 'Not recorded'}
          </DefinitionDetail>
        </InsetSurface>
      </DefinitionList>
    </InsetSurface>
  );
}
