import type {
  ISourcePost,
  SocialTimelineAccount,
  SourcePostNativeActionInput,
  SourcePostNativeActionResult,
} from '@genfeedai/contracts/interfaces';

export interface ConnectedTimelinePostProps {
  account: SocialTimelineAccount;
  post: ISourcePost;
  onAction: (
    postId: string,
    input: SourcePostNativeActionInput,
  ) => Promise<SourcePostNativeActionResult>;
}
