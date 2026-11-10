export interface ModelViewerProps {
  /** Accessible name of the model, read by screen readers. */
  alt: string;
  className?: string;
  /** Shown over the viewer when the GLB cannot be loaded. */
  errorLabel: string;
  /** Still image shown until the model has loaded. */
  poster?: string;
  /** Signed or public URL of a binary glTF (GLB) file. */
  src: string;
}
