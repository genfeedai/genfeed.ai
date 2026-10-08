import type {
  ISourcePost,
  NativeSocialAction,
  SocialTimelineAccount,
} from '@genfeedai/contracts/interfaces';

export type TimelineScope = {
  organizationId: string;
  brandId: string;
  userId: string;
};
export type TimelineCollectedPost = Omit<
  ISourcePost,
  | 'id'
  | 'organizationId'
  | 'brandId'
  | 'sourceId'
  | 'createdAt'
  | 'updatedAt'
  | 'isDeleted'
>;
export type TimelineCapability = Pick<
  SocialTimelineAccount,
  'kind' | 'actions' | 'message'
>;
export type NativeActionRequest = {
  action: NativeSocialAction;
  text?: string;
  externalId: string;
};
