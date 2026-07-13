'use client';

import { BatchItemStatus } from '@genfeedai/enums';
import type { IBatchItem } from '@genfeedai/interfaces';
import {
  DefinitionDetail,
  DefinitionList,
  DefinitionTerm,
} from '@genfeedai/ui';
import InsetSurface from '@ui/display/inset-surface/InsetSurface';
import { useState } from 'react';
import { HiOutlineLightBulb } from 'react-icons/hi2';
import ReviewDecisionPanel from './ReviewDecisionPanel';
import ReviewHistoryPanel from './ReviewHistoryPanel';
import ReviewLineagePanel from './ReviewLineagePanel';
import ReviewPublishOutcomePanel from './ReviewPublishOutcomePanel';

type ReviewPanelItem = IBatchItem & {
  gateOverallScore?: number;
  gateReasons?: string[];
  opportunitySourceType?: 'trend' | 'event' | 'evergreen';
  opportunityTopic?: string;
};

type ReviewEvent = NonNullable<IBatchItem['reviewEvents']>[number];

interface ReviewDetailPanelAsideProps {
  browserTimezone: string;
  formattedCreatedDate: string;
  formattedScheduledDate: string | null;
  isActioning: boolean;
  isReady: boolean;
  isSelected: boolean;
  item: ReviewPanelItem;
  onApprove: (itemId: string) => void;
  onReject: (itemId: string, feedback?: string) => void;
  onRequestChanges: (itemId: string, feedback?: string) => void;
  onToggleSelect: (itemId: string) => void;
  reviewEvents: ReviewEvent[];
  statusLabel: string;
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
  onReject,
  onRequestChanges,
  onToggleSelect,
  reviewEvents,
  statusLabel,
}: ReviewDetailPanelAsideProps) {
  const [feedback, setFeedback] = useState(item.reviewFeedback ?? '');

  return (
    <aside className="space-y-4">
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

      <InsetSurface className="p-5" tone="contrast">
        <h3 className="text-sm font-medium text-foreground">Details</h3>
        <DefinitionList className="mt-4 text-sm">
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
      </InsetSurface>

      <InsetSurface className="p-5" tone="contrast">
        <h3 className="text-sm font-medium text-foreground">
          Version-bound publish approval
        </h3>
        <p className="mt-1 text-sm text-foreground/55">
          Chat and model text never authorize publishing. This typed decision
          locks the exact version, destination, timing, actor, and policy.
        </p>
        <DefinitionList className="mt-4 text-sm">
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
            <DefinitionTerm>Provenance</DefinitionTerm>
            <DefinitionDetail variant="value">
              {item.sourceWorkflowName ??
                item.sourceActionId ??
                'Manual review control'}
            </DefinitionDetail>
          </div>
          <div className="flex items-start justify-between gap-4">
            <DefinitionTerm>Status</DefinitionTerm>
            <DefinitionDetail variant="value">
              {item.publishApproval?.status ?? 'Awaiting typed approval'}
            </DefinitionDetail>
          </div>
        </DefinitionList>
        {item.publishApproval?.invalidationReason && (
          <p className="mt-4 text-sm text-warning">
            {item.publishApproval.invalidationReason}
          </p>
        )}
      </InsetSurface>

      <ReviewLineagePanel item={item} />

      {(item.gateOverallScore !== undefined ||
        (item.gateReasons?.length ?? 0) > 0) && (
        <InsetSurface className="p-5" tone="contrast">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <HiOutlineLightBulb className="size-4 text-foreground/55" />
            Publish Gate
          </div>
          <DefinitionList className="mt-4 text-sm">
            <div className="flex items-start justify-between gap-4">
              <DefinitionTerm>Overall score</DefinitionTerm>
              <DefinitionDetail variant="value">
                {item.gateOverallScore !== undefined
                  ? `${item.gateOverallScore}/100`
                  : 'Not recorded'}
              </DefinitionDetail>
            </div>
          </DefinitionList>

          {(item.gateReasons?.length ?? 0) > 0 && (
            <div className="mt-4 border-t border-white/10 pt-4">
              <h4 className="text-xs font-medium uppercase tracking-[0.18em] text-foreground/45">
                Why it passed
              </h4>
              <ul className="mt-3 space-y-2 text-sm text-foreground/75">
                {item.gateReasons?.map((reason) => (
                  <li
                    key={`${item.id}-${reason}`}
                    className="rounded-2xl border border-white/[0.08] bg-muted/30 px-3 py-2"
                  >
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </InsetSurface>
      )}

      <ReviewPublishOutcomePanel
        browserTimezone={browserTimezone}
        item={item}
      />

      <ReviewHistoryPanel
        browserTimezone={browserTimezone}
        reviewEvents={reviewEvents}
      />

      {item.reviewFeedback && (
        <InsetSurface className="p-5" tone="contrast">
          <h3 className="text-sm font-medium text-foreground">
            Saved reviewer notes
          </h3>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-foreground/75">
            {item.reviewFeedback}
          </p>
        </InsetSurface>
      )}

      {item.status === BatchItemStatus.FAILED && item.error && (
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-5">
          <h3 className="text-sm font-medium text-rose-200">Failure reason</h3>
          <p className="mt-2 text-sm leading-6 text-rose-100/85">
            {item.error}
          </p>
        </div>
      )}
    </aside>
  );
}
