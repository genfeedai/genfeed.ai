import type { IMember } from '@genfeedai/contracts/interfaces';

export type MemberBrandAccessProps = {
  member: Pick<IMember, 'brands' | 'role' | 'roleKey'>;
};
