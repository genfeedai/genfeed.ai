import type { SuggestedAction } from '@genfeedai/agent/models/agent-suggested-action.model';
import { MemberRole } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import { filterActionsByRole } from './filter-actions-by-role';

function action(id: string, visibleTo?: MemberRole[]): SuggestedAction {
  return {
    id,
    label: id,
    prompt: id,
    visibleTo,
  };
}

describe('filterActionsByRole', () => {
  const actions = [
    action('public'),
    action('owners', [MemberRole.OWNER, MemberRole.ADMIN]),
    action('creators', [MemberRole.CREATOR]),
  ];

  it('keeps unrestricted actions when no role is provided', () => {
    expect(filterActionsByRole(actions).map((item) => item.id)).toEqual([
      'public',
    ]);
  });

  it('keeps unrestricted actions and role-matched restricted ones', () => {
    expect(
      filterActionsByRole(actions, MemberRole.ADMIN).map((item) => item.id),
    ).toEqual(['public', 'owners']);
    expect(
      filterActionsByRole(actions, MemberRole.CREATOR).map((item) => item.id),
    ).toEqual(['public', 'creators']);
  });

  it('hides restricted actions from roles that are not listed', () => {
    expect(
      filterActionsByRole(actions, MemberRole.USER).map((item) => item.id),
    ).toEqual(['public']);
  });
});
