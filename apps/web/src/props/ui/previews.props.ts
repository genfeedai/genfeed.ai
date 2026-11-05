import type {
  IChannelTarget,
  ICredential,
  IReleaseGroup,
} from '@genfeedai/contracts/interfaces';
import type { PlatformPreviewProps } from '@genfeedai/props/components/platform-preview.props';

/**
 * The slice of a release group a preview renderer needs. `attachments` is
 * included because signature and first-comment content can live at either
 * level: `release.attachments` carries release-wide entries (e.g. a global
 * signature), while `target.attachments` carries entries scoped to one
 * channel target. Renderers merge both sources.
 */
export type TargetPreviewRelease = Pick<
  IReleaseGroup,
  'attachments' | 'baseContent' | 'media' | 'title'
>;

/** The slice of a connected credential a preview renderer needs for author identity. */
export type TargetPreviewCredential = Pick<
  ICredential,
  'externalAvatar' | 'externalHandle' | 'externalName' | 'label' | 'platform'
>;

export interface TargetPreviewProps {
  release: TargetPreviewRelease;
  target: IChannelTarget;
  credential: TargetPreviewCredential;
  className?: string;
  /** `compact` is the flat card for a narrow side panel: author, media, text. */
  presentation?: PlatformPreviewProps['presentation'];
}
