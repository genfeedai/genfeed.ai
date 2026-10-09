'use client';

import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type {
  BreakoutLiveCapacitySnapshot,
  BreakoutOutputRecoveryReason,
  BreakoutOutputRecoveryState,
} from '@genfeedai/contracts/interfaces';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { BreakoutResponseDetailProps } from '@props/analytics/breakout-response-detail.props';
import { Badge } from '@ui/primitives/badge';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import Link from 'next/link';

const STATE_LABELS: Record<BreakoutOutputRecoveryState, string> = {
  not_submitted: 'Not submitted',
  generation_in_flight: 'Generating',
  reconciliation_required: 'Needs reconciliation',
  generated: 'Generated',
  draft: 'Draft',
  awaiting_review: 'Awaiting review',
  scheduled: 'Scheduled',
  paused: 'Paused',
  publishing: 'Publishing',
  published: 'Published',
  failed: 'Failed',
  suppressed: 'Suppressed',
  expired: 'Expired',
};
const REASON_LABELS: Record<BreakoutOutputRecoveryReason, string> = {
  not_dispatched: 'Generation has not started.',
  provider_pending: 'Waiting for the existing generation request.',
  generation_receipt_missing: 'The generation result needs reconciliation.',
  receipt_invalid: 'The saved generation result could not be verified.',
  generation_outcome_indeterminate: 'The generation outcome is uncertain.',
  generation_failed: 'Generation failed.',
  quality_or_brand_blocked: 'Brand or quality checks are holding this output.',
  media_brand_capability_unavailable:
    'Generation is held because this media format cannot yet meet the brand requirements.',
  quality_evaluation_pending:
    'The quality evaluation needs reconciliation before this draft can proceed.',
  platform_quality_blocked:
    'This draft has not passed the account’s quality requirements.',
  approved_brand_required: 'An approved brand snapshot is required.',
  brand_review_required: 'Brand review is required.',
  artifact_binding_missing:
    'The generated content has not been attached to a post.',
  publication_admission_required:
    'The normal publishing checks are still required.',
  publication_confirmation_missing: 'Publication has not been confirmed.',
  publication_in_flight: 'Waiting for publication confirmation.',
  publication_failed: 'Publication failed.',
  publication_paused: 'Publication is paused.',
  publication_cancelled: 'Publication was cancelled.',
  output_suppressed: 'This output was suppressed.',
  output_expired: 'This output expired.',
  confirmed_publication: 'Publication is confirmed.',
};

const CAPACITY_REASON_LABELS: Record<
  Extract<BreakoutLiveCapacitySnapshot, { status: 'held' }>['reason'],
  string
> = {
  missing_strategy: 'The selected strategy is unavailable.',
  account_unavailable: 'The connected account is unavailable.',
  wallet_unavailable: 'The current credit balance is unavailable.',
  ledger_usage_unavailable:
    'Current spending or reserved credits could not be verified.',
  policy_unreadable:
    'The strategy budget or posting policy could not be verified.',
};

function metricValue(value: number | null): string {
  return value === null ? 'Unavailable' : value.toLocaleString();
}

export default function BreakoutResponseDetail({
  response,
}: BreakoutResponseDetailProps) {
  const { href } = useOrgUrl();
  const { source, trigger, capacity } = response;
  return (
    <section aria-label="Breakout response details" className="space-y-5">
      <Heading as="h2">Response details</Heading>
      <Text as="p" size="sm">
        Response state: {response.state.replaceAll('_', ' ')}
      </Text>
      <Text as="p" color="muted" size="sm">
        Detection does not confirm generation or publication. Refresh to read
        the latest status.
      </Text>
      <div className="space-y-2">
        <Heading as="h3" size="md">
          Source evidence
        </Heading>
        <Text as="p">
          {response.platform} · {source.format ?? 'Unknown format'}
        </Text>
        <Text as="p" size="sm" className="break-all">
          Original post: {source.externalId}
        </Text>
        {source.kind === 'post' && source.id && (
          <Link
            className="text-sm underline"
            href={href(
              `${APP_ROUTES.PUBLISHING.POSTS}/${encodeURIComponent(source.id)}`,
            )}
          >
            Open original post
          </Link>
        )}
        {source.status !== 'current' && (
          <Text as="p" color="destructive" role="status">
            The original post changed or is unavailable. Response execution is
            held.
          </Text>
        )}
        {trigger ? (
          <div className="space-y-1">
            <Text as="p">
              Performance:{' '}
              {trigger.ratio === null
                ? 'Unavailable'
                : `${trigger.ratio.toLocaleString()}×`}{' '}
              the comparable median
            </Text>
            <Text as="p">
              {trigger.metric}: {metricValue(trigger.targetValue)} · Median:{' '}
              {metricValue(trigger.median)} · Prior posts: {trigger.sampleSize}
            </Text>
            <Text as="p" color="muted" size="sm">
              Exposure provenance:{' '}
              {trigger.exposureScope ?? 'Not retained in this legacy receipt'}
            </Text>
            <Text as="p" color="muted" size="sm">
              Evidence recorded: {trigger.evaluatedAt} ·{' '}
              {trigger.metricSource ?? 'Unknown metric source'}
            </Text>
          </div>
        ) : (
          <Text as="p" role="status">
            Verified trigger evidence is unavailable.
          </Text>
        )}
      </div>
      <div className="space-y-3">
        <Heading as="h3" size="md">
          Follow-up outputs
        </Heading>
        {response.outputRegistryStatus === 'conflict' ? (
          <Text as="p" role="status">
            Response status needs reconciliation. The output plan could not be
            verified.
          </Text>
        ) : response.outputs === null ? (
          <Text as="p" role="status">
            Detailed output status has not been loaded.
          </Text>
        ) : response.outputs.length === 0 ? (
          <Text as="p">No follow-up outputs have been reserved.</Text>
        ) : (
          response.outputs.map((output) => (
            <div
              key={output.id}
              className="space-y-2 rounded-lg border border-border p-4"
            >
              <Heading as="h4" size="sm">
                Output {output.ordinal}:{' '}
                {output.kind === 'quote' ? 'X quote' : 'Follow-up'} ·{' '}
                {output.format}
              </Heading>
              {output.recovery.status === 'unavailable' ? (
                <Text as="p" role="status">
                  Output status is unavailable. Execution is held.
                </Text>
              ) : (
                <>
                  <Badge>{STATE_LABELS[output.recovery.state]}</Badge>
                  <Text as="p" size="sm">
                    {REASON_LABELS[output.recovery.reason]}
                  </Text>
                  {output.recovery.postId && (
                    <Link
                      className="text-sm underline"
                      href={href(
                        `${APP_ROUTES.PUBLISHING.POSTS}/${encodeURIComponent(output.recovery.postId)}`,
                      )}
                    >
                      Open follow-up post {output.ordinal}
                    </Link>
                  )}
                  {output.recovery.state === 'published' &&
                    output.recovery.externalId && (
                      <Text as="p" size="sm" className="break-all">
                        Published post: {output.recovery.externalId}
                      </Text>
                    )}
                </>
              )}
            </div>
          ))
        )}
      </div>
      <div className="space-y-2">
        <Heading as="h3" size="md">
          Capacity
        </Heading>
        {capacity === null ? (
          <Text as="p" color="muted" size="sm">
            Remaining credits and posting slots have not been checked for a
            strategy.
          </Text>
        ) : capacity.status === 'held' ? (
          <Text as="p" role="status">
            Capacity is held. {CAPACITY_REASON_LABELS[capacity.reason]}
          </Text>
        ) : (
          <>
            <Text as="p">
              Remaining posting slots:{' '}
              {metricValue(capacity.remainingPublicationSlots)}
            </Text>
            <Text as="p">
              Available organization credits:{' '}
              {metricValue(capacity.budget.availableOrganizationCredits)}
            </Text>
            <Text as="p" color="muted" size="sm">
              Advisory snapshot from {capacity.capturedAt}. No credits or
              posting slots are reserved by this read.
            </Text>
          </>
        )}
      </div>
      <Text as="p" color="muted" size="xs">
        Status read: {response.readAt}
      </Text>
    </section>
  );
}
