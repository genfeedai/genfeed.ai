'use client';

import { BatchItemStatus } from '@genfeedai/enums';
import {
  DefinitionDetail,
  DefinitionList,
  DefinitionTerm,
} from '@genfeedai/ui';
import { useState } from 'react';

import ReviewAssignmentPanel from './ReviewAssignmentPanel';
import ReviewDecisionPanel from './ReviewDecisionPanel';
import ReviewHistoryPanel from './ReviewHistoryPanel';
import ReviewLineagePanel from './ReviewLineagePanel';
import ReviewPublishOutcomePanel from './ReviewPublishOutcomePanel';
import type { ReviewPanelItem } from './review-panel.types';

type ReviewEvent = NonNullable<ReviewPanelItem['reviewEvents']>[number];

interface ReviewDetailPanelAsideProps {
  browserTimezone: string;
  formattedCreatedDate: string;
  formattedScheduledDate: string | null;
  isActioning: boolean;
  isReady: boolean;
  isSelected: boolean;
  item: ReviewPanelItem;
  onApprove: (itemId: string) => void;
  onAssign: (itemId: string, assigneeId: string) => void;
  onReject: (itemId: string, feedback?: string) => void;
  onRequestChanges: (itemId: string, feedback?: string) => void;
  onToggleSelect: (itemId: string) => void;
  onUnassign: (itemId: string) => void;
  reviewEvents: ReviewEvent[];
  statusLabel: string;
}

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

      <Section title="Assignee">
        <ReviewAssignmentPanel
          isActioning={isActioning}
          item={item}
          onAssign={onAssign}
          onUnassign={onUnassign}
        />
      </Section>

      <Section title="Details">
        <DefinitionList className="text-sm">
          <div className="flex items-start justify-between gap-4">
            <DefinitionTerm>Created</DefinitionTerm>
            <DefinitionDetail variant="value">
              {formattedCreatedDate}
            </DefinitionDetail>
          </div>
          <div className="flex items-start justify-between gap-4">
            <DefinitionTerm>Scheduled</DefinitionTerm>
            <DefinitionDetail variant="value">
              {formattedScheduledDate ?? 'Not scheduled'}
            </DefinitionDetail>
          </div>
          <div className="flex items-start justify-between gap-4">
            <DefinitionTerm>Post draft</DefinitionTerm>
            <DefinitionDetail variant="value">
              {item.postId ? 'Draft linked' : 'No draft linked'}
            </DefinitionDetail>
          </div>
          <div className="flex items-start justify-between gap-4">
            <DefinitionTerm>Review state</DefinitionTerm>
            <DefinitionDetail variant="value">{statusLabel}</DefinitionDetail>
          </div>
        </DefinitionList>
      </Section>

      <Section title="Publish approval">
        <p className="text-xs leading-5 text-muted-foreground">
          Approval pins version, destination, timing, and policy — chat never
          authorizes publish on its own.
        </p>
        <DefinitionList className="mt-3 text-sm">
          <div className="flex items-start justify-between gap-4">
            <DefinitionTerm>Version</DefinitionTerm>
            <DefinitionDetail variant="value">
              {item.publishApproval?.artifactVersionPinId ??
                item.versionPinId ??
                'Pinned on approval'}
            </DefinitionDetail>
          </div>
          <div className="flex items-start justify-between gap-4">
            <DefinitionTerm>Destination</DefinitionTerm>
            <DefinitionDetail variant="value">
              {item.publishApproval?.destinations
                .map((destination) => destination.platform)
                .join(', ') ??
                item.platform ??
                'Not selected'}
            </DefinitionDetail>
          </div>
          <div className="flex items-start justify-between gap-4">
            <DefinitionTerm>Timing</DefinitionTerm>
            <DefinitionDetail variant="value">
              {item.publishApproval?.scheduleIntent.kind === 'scheduled'
                ? formattedScheduledDate
                : item.publishApproval?.scheduleIntent.kind === 'immediate'
                  ? 'Publish now'
                  : (formattedScheduledDate ?? 'Requires publish confirmation')}
            </DefinitionDetail>
          </div>
          <div className="flex items-start justify-between gap-4">
            <DefinitionTerm>Policy</DefinitionTerm>
            <DefinitionDetail variant="value">
              {item.publishApproval
                ? `${item.publishApproval.policy.id} v${item.publishApproval.policy.version}`
                : 'version-bound-publish-v1'}
            </DefinitionDetail>
          </div>
          <div className="flex items-start justify-between gap-4">
            <DefinitionTerm>Status</DefinitionTerm>
            <DefinitionDetail variant="value">
              {item.publishApproval?.status ?? 'Awaiting typed approval'}
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
        <Section title="Publish gate">
          <DefinitionList className="text-sm">
            <div className="flex items-start justify-between gap-4">
              <DefinitionTerm>Overall score</DefinitionTerm>
              <DefinitionDetail variant="value">
                {item.gateOverallScore !== undefined
                  ? `${item.gateOverallScore}/100`
                  : 'Not recorded'}
              </DefinitionDetail>
            </div>
          </DefinitionList>
          {(item.gateReasons?.length ?? 0) > 0 ? (
            <ul className="mt-3 space-y-1.5 text-sm text-foreground/75">
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
        <Section title="Saved notes">
          <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/80">
            {item.reviewFeedback}
          </p>
        </Section>
      ) : null}

      {item.status === BatchItemStatus.FAILED && item.error ? (
        <Section title="Failure">
          <p className="text-sm leading-6 text-destructive">{item.error}</p>
        </Section>
      ) : null}
    </aside>
  );
}
