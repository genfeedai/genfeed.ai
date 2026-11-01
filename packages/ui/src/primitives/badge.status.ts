import type { LucideIcon } from 'lucide-react';
import {
  type StatusKey,
  statusBadge,
  statusIcon,
} from '../tokens/status-colors';
import type { BadgeVariant } from './badge.variants';

export interface BadgeStatus {
  /** Extra tint classes for a canonical status; layered over the variant. */
  className?: string;
  Icon?: LucideIcon;
  label: string;
  variant: BadgeVariant;
}

function getCanonicalStatusVariant(status: StatusKey): BadgeVariant {
  const tone = statusBadge[status];
  if (tone.includes('text-success')) {
    return 'success';
  }
  if (tone.includes('text-destructive')) {
    return 'destructive';
  }
  if (tone.includes('text-warning')) {
    return 'warning';
  }
  if (tone.includes('text-info')) {
    return 'info';
  }
  return 'secondary';
}

function toLabel(status: string): string {
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
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
      getCanonicalStatusVariant(canonical),
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

    // Operational status
    case 'validated':
    case 'operational':
      return fromCanonical('active', 'Operational', 'success');

    // Subscription lifecycle states that have no canonical tone of their own
    case 'trialing':
      return { label: toLabel(normalized), variant: 'info' };
    case 'past_due':
    case 'incomplete':
    case 'unpaid':
      return fromCanonical('pending', toLabel(normalized), 'warning');

    default:
      // An unmapped status still names itself; an empty dot says nothing.
      return { label: toLabel(normalized), variant: 'default' };
  }
}
