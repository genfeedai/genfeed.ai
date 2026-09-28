import type { CampaignStatus } from '@genfeedai/contracts';

// The agent-Program status field is a plain string union; the outreach
// CampaignStatus enum carries the identical runtime values. Accepting both
// representations lets one helper serve both campaign detail pages without a
// cross-type cast at either call site.
export type CampaignLifecycleStatus =
  | 'draft'
  | 'active'
  | 'paused'
  | 'completed'
  | CampaignStatus;

export type CampaignPrimaryActionKind = 'resume' | 'pause' | 'start' | null;

/**
 * One primary header action per campaign lifecycle state (#5483): Resume
 * when paused, Pause when running, Start for a draft that has never run. A
 * completed campaign has nothing left to run, so it carries no primary
 * action — Complete moves to the overflow menu instead.
 */
export function getCampaignPrimaryActionKind(
  status: CampaignLifecycleStatus,
): CampaignPrimaryActionKind {
  switch (status) {
    case 'paused':
      return 'resume';
    case 'active':
      return 'pause';
    case 'draft':
      return 'start';
    case 'completed':
      return null;
    default:
      return null;
  }
}
