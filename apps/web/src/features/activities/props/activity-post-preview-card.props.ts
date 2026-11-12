import type { IActivityPostPreview } from '@genfeedai/contracts/interfaces';

export interface ActivityPostPreviewCardProps {
  preview: IActivityPostPreview;
  /** Where the remix opens; omitted when the viewer has nothing to remix. */
  remixHref?: string;
}
