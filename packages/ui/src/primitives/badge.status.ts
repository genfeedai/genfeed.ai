import {
  Info,
  type LucideIcon,
  Plug,
  TriangleAlert,
  Unplug,
} from 'lucide-react';
import {
  type StatusKey,
  statusBadge,
  statusBadgeVariant,
  statusIcon,
} from '../tokens/status-colors';
import type { BadgeVariant } from './badge.variants';

const UNDERSCORES_PATTERN = /_/g;
const WORD_INITIALS_PATTERN = /\b\w/g;

export interface BadgeStatus {
  /** Extra tint classes for a canonical status; layered over the variant. */
  className?: string;
  Icon?: LucideIcon;
  label: string;
  variant: BadgeVariant;
}

function toLabel(status: string): string {
  return status
    .replace(UNDERSCORES_PATTERN, ' ')
    .replace(WORD_INITIALS_PATTERN, (character) => character.toUpperCase());
}

function fromCanonical(
  canonicalStatus: StatusKey,
  label: string,
  variant: BadgeVariant,
): BadgeStatus {
  return {
    className: statusBadge[canonicalStatus],
    Icon: statusIcon[canonicalStatus],
    label,
    variant,
  };
}

/**
 * Resolve a product status or content-type string to the badge variant,
 * default label, icon and tint. This is the one place that knows product
 * vocabulary; `Badge` itself only has the semantic variants.
 */
export function getBadgeStatus(status: string): BadgeStatus {
  const normalized = status.toLowerCase().trim();

  if (normalized in statusBadge) {
    const canonical = normalized as StatusKey;
    return fromCanonical(
      canonical,
      toLabel(canonical),
      statusBadgeVariant[canonical],
    );
  }

  switch (normalized) {
    case 'published':
    case 'success':
      return fromCanonical('completed', 'Completed', 'success');
    case 'scheduled':
      return fromCanonical('pending', 'Scheduled', 'warning');
    case 'info':
      return { label: 'Information', variant: 'info' };
    case 'processing':
    case 'uploading':
      return fromCanonical('running', 'Processing', 'info');
    case 'inactive':
    case 'warning':
      return fromCanonical('pending', 'Pending', 'warning');
    case 'canceled':
      return fromCanonical('cancelled', 'Cancelled', 'secondary');
    case 'draft':
    case 'private':
    case 'unlisted':
    case 'skipped':
      return fromCanonical('planned', 'Draft', 'secondary');

    // Content type badges
    case 'image':
    case 'image_edit':
      return { label: 'Image', variant: 'info' };
    case 'video':
    case 'video_edit':
      return { label: 'Video', variant: 'default' };
    case 'gif':
      return { label: 'GIF', variant: 'info' };
    case 'avatar':
      return { label: 'Avatar', variant: 'info' };
    case 'audio':
    case 'music':
      return { label: 'Audio', variant: 'warning' };
    case 'voice':
      return { label: 'Voice', variant: 'warning' };
    case 'text':
      return { label: 'Text', variant: 'success' };
    case 'multimodal':
      return { label: 'Multimodal', variant: 'default' };

    // Pricing reconciliation
    case 'verified':
      return fromCanonical('completed', 'Verified', 'success');
    case 'discrepant':
      return fromCanonical('error', 'Discrepant', 'destructive');
    case 'unresolved':
      return fromCanonical('pending', 'Unresolved', 'warning');

    // Account / integration connection health
    case 'disconnected':
      return { Icon: Unplug, label: 'Disconnected', variant: 'destructive' };
    case 'connected':
      return { Icon: Plug, label: 'Connected', variant: 'info' };
    case 'healthy':
      return fromCanonical('completed', 'Healthy', 'success');
    case 'needs_attention':
      return {
        Icon: TriangleAlert,
        label: 'Needs attention',
        variant: 'warning',
      };
    case 'recorded':
      return { Icon: Info, label: 'Recorded', variant: 'info' };

    // Operational status
    case 'validated':
    case 'operational':
      return fromCanonical('active', 'Operational', 'success');

    // Subscription lifecycle states that have no canonical tone of their own
    case 'trialing':
      return { label: toLabel(normalized), variant: 'info' };
    case 'trial':
      return { label: 'Trial', variant: 'info' };
    case 'free':
      return { label: 'Free', variant: 'secondary' };
    case 'subscribed':
      return fromCanonical('active', 'Subscribed', 'success');
    case 'past_due':
    case 'pastdue':
    case 'incomplete':
    case 'unpaid':
      return fromCanonical(
        'pending',
        toLabel(normalized === 'pastdue' ? 'past_due' : normalized),
        'warning',
      );

    // A user part-way through onboarding
    case 'onboarding':
      return fromCanonical('in_progress', 'Onboarding', 'warning');

    // Concierge account lifecycle
    case 'provisioning':
      return fromCanonical('running', 'Provisioning', 'info');
    case 'provisioned':
    case 'claimed':
      return fromCanonical('active', toLabel(normalized), 'success');
    case 'invited':
      return fromCanonical('pending', 'Invited', 'warning');

    default:
      // An unmapped status still names itself; an empty dot says nothing.
      return { label: toLabel(normalized), variant: 'default' };
  }
}
