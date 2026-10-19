import {
  DefinitionDetail,
  DefinitionList,
  DefinitionTerm,
} from '@genfeedai/ui';
import type { AgentOpportunityPanelProps } from '@props/automation/agent-opportunity-panel.props';
import Badge from '@ui/display/badge/Badge';
import InsetSurface from '@ui/display/inset-surface/InsetSurface';
import { ListRow } from '@ui/lists/list-row/ListRow';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { useTranslations } from 'next-intl';

export default function AgentOpportunityPanel({
  opportunities,
  requestedOpportunityId,
  selectedOpportunity,
  isOpportunitiesLoading,
}: AgentOpportunityPanelProps) {
  const translate = useTranslations(
    'common.automation.agentDetail.opportunityPanel',
  );

  return (
    <InsetSurface className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-medium text-foreground">
            {translate('reviewContext')}
          </h3>
          <p className="mt-1 text-sm text-foreground/55">
            {translate('reviewContextDescription')}
          </p>
        </div>
        <Badge variant="secondary">
          {selectedOpportunity?.sourceType ?? translate('loading')}
        </Badge>
      </div>

      <DefinitionList
        variant="grid"
        className="mt-4 gap-3 text-sm md:grid-cols-2"
      >
        <InsetSurface className="p-3" density="compact" tone="contrast">
          <DefinitionTerm>{translate('opportunity')}</DefinitionTerm>
          <DefinitionDetail
            variant="inline"
            className="mt-1 text-foreground/85"
          >
            {selectedOpportunity?.topic ??
              (isOpportunitiesLoading
                ? translate('loadingOpportunity')
                : requestedOpportunityId)}
          </DefinitionDetail>
        </InsetSurface>
        <InsetSurface className="p-3" density="compact" tone="contrast">
          <DefinitionTerm>{translate('status')}</DefinitionTerm>
          <DefinitionDetail
            variant="inline"
            className="mt-1 capitalize text-foreground/85"
          >
            {selectedOpportunity?.status ??
              (isOpportunitiesLoading
                ? translate('loading')
                : translate('unavailable'))}
          </DefinitionDetail>
        </InsetSurface>
        <InsetSurface className="p-3" density="compact" tone="contrast">
          <DefinitionTerm>{translate('reason')}</DefinitionTerm>
          <DefinitionDetail
            variant="inline"
            className="mt-1 text-foreground/85"
          >
            {selectedOpportunity?.decisionReason ?? translate('notRecorded')}
          </DefinitionDetail>
        </InsetSurface>
        <InsetSurface className="p-3" density="compact" tone="contrast">
          <DefinitionTerm>{translate('expectedTraffic')}</DefinitionTerm>
          <DefinitionDetail
            variant="inline"
            className="mt-1 text-foreground/85"
          >
            {selectedOpportunity?.expectedTrafficScore ??
              translate('notRecorded')}
          </DefinitionDetail>
        </InsetSurface>
      </DefinitionList>

      <div className="mt-4 space-y-2">
        <h4 className="text-sm font-medium text-foreground">
          {translate('openOpportunities')}
        </h4>
        {opportunities.length > 0 ? (
          <InsetSurface className="overflow-hidden p-0">
            {opportunities.map((opportunity) => (
              <ListRow
                data-testid={`agent-opportunity-${opportunity.id}`}
                density="compact"
                key={opportunity.id}
                meta={translate('opportunityMeta', {
                  priority: opportunity.priorityScore,
                  source: opportunity.sourceType,
                })}
                title={opportunity.topic}
                trailing={
                  <Badge className="capitalize" variant="secondary">
                    {opportunity.status}
                  </Badge>
                }
              />
            ))}
          </InsetSurface>
        ) : (
          <p className="text-sm text-foreground/55">
            {isOpportunitiesLoading
              ? translate('loadingOpportunities')
              : translate('noOpenOpportunities')}
          </p>
        )}
        <AutoPagination showTotal totalLabel={translate('totalLabel')} />
      </div>
    </InsetSurface>
  );
}
