export interface CameraPreviewProps {
  /** The live camera stream; nothing renders while it is null. */
  stream: MediaStream | null;
  /** Mirror the image, as people expect when they see themselves. */
  isMirrored?: boolean;
  className?: string;
  label: string;
}
