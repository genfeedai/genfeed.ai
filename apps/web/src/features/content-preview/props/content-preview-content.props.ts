import type { IPublicContentPreview } from '@genfeedai/contracts/interfaces';

export type ContentPreviewContentProps = {
  token: string;
};

export type ContentPreviewLoadState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { preview: IPublicContentPreview; status: 'ready' };
