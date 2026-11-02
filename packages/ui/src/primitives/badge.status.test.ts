import { describe, expect, it } from 'vitest';
import { getBadgeStatus } from './badge.status';

describe('getBadgeStatus', () => {
  it.each([
    ['achieved', 'Achieved', 'success'],
    ['active', 'Active', 'success'],
    ['approved', 'Approved', 'success'],
    ['archived', 'Archived', 'secondary'],
    ['backlog', 'Backlog', 'secondary'],
    ['blocked', 'Blocked', 'destructive'],
    ['completed', 'Completed', 'success'],
    ['done', 'Done', 'success'],
    ['error', 'Error', 'destructive'],
    ['idle', 'Idle', 'warning'],
    ['in_progress', 'In Progress', 'warning'],
    ['in_review', 'In Review', 'info'],
    ['paused', 'Paused', 'warning'],
    ['pending', 'Pending', 'warning'],
    ['pending_approval', 'Pending Approval', 'warning'],
    ['planned', 'Planned', 'secondary'],
    ['rejected', 'Rejected', 'destructive'],
    ['revision_requested', 'Revision Requested', 'warning'],
    ['running', 'Running', 'info'],
    ['succeeded', 'Succeeded', 'success'],
    ['terminated', 'Terminated', 'destructive'],
    ['timed_out', 'Timed Out', 'warning'],
    ['todo', 'Todo', 'info'],
    ['onboarding', 'Onboarding', 'warning'],
    ['free', 'Free', 'secondary'],
    ['trial', 'Trial', 'info'],
    ['subscribed', 'Subscribed', 'success'],
    ['pastdue', 'Past Due', 'warning'],
    ['cancelled', 'Cancelled', 'secondary'],
    ['provisioning', 'Provisioning', 'info'],
    ['provisioned', 'Provisioned', 'success'],
    ['invited', 'Invited', 'warning'],
    ['claimed', 'Claimed', 'success'],
    ['failed', 'Failed', 'destructive'],
    ['verified', 'Verified', 'success'],
    ['discrepant', 'Discrepant', 'destructive'],
    ['unresolved', 'Unresolved', 'warning'],
  ])('maps %s to the %s label and %s variant', (status, label, variant) => {
    expect(getBadgeStatus(status)).toMatchObject({ label, variant });
  });

  it('names an unknown status instead of rendering it blank', () => {
    expect(getBadgeStatus('on_hold')).toMatchObject({
      label: 'On Hold',
      variant: 'default',
    });
  });
});
