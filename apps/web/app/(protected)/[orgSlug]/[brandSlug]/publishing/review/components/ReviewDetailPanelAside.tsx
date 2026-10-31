import { TurboRunItemStatus } from '@genfeedai/contracts';
import {
  DefinitionDetail,
  DefinitionList,
  DefinitionTerm,
} from '@genfeedai/ui';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { ReviewDetailPanelAsideProps } from '@/features/posts/props/review-detail-panel-aside.props';

import ReviewAssignmentPanel from './ReviewAssignmentPanel';
import ReviewDecisionPanel from './ReviewDecisionPanel';
import ReviewHistoryPanel from './ReviewHistoryPanel';
import ReviewLineagePanel from './ReviewLineagePanel';
import ReviewPublishOutcomePanel from './ReviewPublishOutcomePanel';

function Section({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <div className="space-y-3 border-b border-border px-4 py-4 last:border-b-0">
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      {children}
    </div>
  );
}

export default function ReviewDetailPanelAside({
  browserTimezone,
  formattedCreatedDate,
  formattedScheduledDate,
  isActioning,
  isReady,
  isSelected,
  item,
  onApprove,
  onAssign,
  onReject,
  onRequestChanges,
  onToggleSelect,
  onUnassign,
  reviewEvents,
  statusLabel,
}: ReviewDetailPanelAsideProps) {
  const translate = useTranslations('pages.publishing.review');
  const [feedback, setFeedback] = useState(item.reviewFeedback ?? '');

  return (
    <aside className="flex min-h-0 flex-col">
      <div className="border-b border-border px-4 py-4">
        <ReviewDecisionPanel
          feedback={feedback}
          isActioning={isActioning}
          isReady={isReady}
          isSelected={isSelected}
          item={item}
          onApprove={onApprove}
          onReject={onReject}
          onRequestChanges={onRequestChanges}
          onToggleSelect={onToggleSelect}
          setFeedback={setFeedback}
        />
      </div>

      <Section title={translate('detail.assignee')}>
        <ReviewAssignmentPanel
          isActioning={isActioning}
          item={item}
          onAssign={onAssign}
          onUnassign={onUnassign}
        />
      </Section>

      <Section title={translate('detail.title')}>
        <DefinitionList className="text-sm">
          <div className="flex items-start justify-between gap-4">
            <DefinitionTerm>{translate('detail.created')}</DefinitionTerm>
            <DefinitionDetail variant="value">
              {formattedCreatedDate}
            </DefinitionDetail>
          </div>
          <div className="flex items-start justify-between gap-4">
            <DefinitionTerm>{translate('detail.scheduled')}</DefinitionTerm>
            <DefinitionDetail variant="value">
              {formattedScheduledDate ?? translate('detail.notScheduled')}
            </DefinitionDetail>
          </div>
          <div className="flex items-start justify-between gap-4">
            <DefinitionTerm>{translate('detail.postDraft')}</DefinitionTerm>
            <DefinitionDetail variant="value">
              {item.postId
                ? translate('detail.draftLinked')
                : translate('detail.noDraftLinked')}
            </DefinitionDetail>
          </div>
          <div className="flex items-start justify-between gap-4">
            <DefinitionTerm>{translate('detail.state')}</DefinitionTerm>
            <DefinitionDetail variant="value">{statusLabel}</DefinitionDetail>
          </div>
        </DefinitionList>
      </Section>

      <Section title={translate('approval.title')}>
        <p className="text-xs leading-5 text-muted-foreground">
          {translate('approval.description')}
        </p>
        <DefinitionList className="mt-3 text-sm">
          <div className="flex items-start justify-between gap-4">
            <DefinitionTerm>{translate('approval.version')}</DefinitionTerm>
            <DefinitionDetail variant="value">
              {item.publishApproval?.artifactVersionPinId ??
                item.versionPinId ??
                translate('approval.pinnedOnApproval')}
            </DefinitionDetail>
          </div>
          <div className="flex items-start justify-between gap-4">
            <DefinitionTerm>{translate('approval.destination')}</DefinitionTerm>
            <DefinitionDetail variant="value">
              {item.publishApproval?.destinations
                .map((destination) => destination.platform)
                .join(', ') ??
                item.platform ??
                translate('approval.notSelected')}
            </DefinitionDetail>
          </div>
          <div className="flex items-start justify-between gap-4">
            <DefinitionTerm>{translate('approval.timing')}</DefinitionTerm>
            <DefinitionDetail variant="value">
              {item.publishApproval?.scheduleIntent.kind === 'scheduled'
                ? formattedScheduledDate
                : item.publishApproval?.scheduleIntent.kind === 'immediate'
                  ? translate('approval.publishNow')
                  : (formattedScheduledDate ??
                    translate('approval.requiresConfirmation'))}
            </DefinitionDetail>
          </div>
          <div className="flex items-start justify-between gap-4">
            <DefinitionTerm>{translate('approval.policy')}</DefinitionTerm>
            <DefinitionDetail variant="value">
              {item.publishApproval
                ? `${item.publishApproval.policy.id} v${item.publishApproval.policy.version}`
                : 'version-bound-publish-v1'}
            </DefinitionDetail>
          </div>
          <div className="flex items-start justify-between gap-4">
            <DefinitionTerm>{translate('approval.status')}</DefinitionTerm>
            <DefinitionDetail variant="value">
              {item.publishApproval?.status ??
                translate('approval.awaitingTypedApproval')}
            </DefinitionDetail>
          </div>
        </DefinitionList>
        {item.publishApproval?.invalidationReason ? (
          <p className="mt-2 text-xs text-warning">
            {item.publishApproval.invalidationReason}
          </p>
        ) : null}
      </Section>

      <ReviewLineagePanel item={item} />

      {(item.gateOverallScore !== undefined ||
        (item.gateReasons?.length ?? 0) > 0) && (
        <Section title={translate('gate.title')}>
          <DefinitionList className="text-sm">
            <div className="flex items-start justify-between gap-4">
              <DefinitionTerm>{translate('gate.score')}</DefinitionTerm>
              <DefinitionDetail variant="value">
                {item.gateOverallScore !== undefined
                  ? `${item.gateOverallScore}/100`
                  : translate('gate.notRecorded')}
              </DefinitionDetail>
            </div>
          </DefinitionList>
          {(item.gateReasons?.length ?? 0) > 0 ? (
            <ul className="mt-3 space-y-1.5 text-sm text-foreground/80">
              {item.gateReasons?.map((reason) => (
                <li key={`${item.id}-${reason}`} className="leading-5">
                  · {reason}
                </li>
              ))}
            </ul>
          ) : null}
        </Section>
      )}

      <ReviewPublishOutcomePanel
        browserTimezone={browserTimezone}
        item={item}
      />

      <ReviewHistoryPanel
        browserTimezone={browserTimezone}
        reviewEvents={reviewEvents}
      />

      {item.reviewFeedback ? (
        <Section title={translate('detail.savedNotes')}>
          <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/80">
            {item.reviewFeedback}
          </p>
        </Section>
      ) : null}

      {item.status === TurboRunItemStatus.FAILED && item.error ? (
        <Section title={translate('detail.failure')}>
          <p className="text-sm leading-6 text-destructive">{item.error}</p>
        </Section>
      ) : null}
    </aside>
  );
}
