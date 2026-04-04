import type { StudioCanvasProps } from '@props/studio/studio.props';

export default function StudioCanvas({
  children,
}: StudioCanvasProps): React.ReactElement {
  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
      {children}
    </div>
  );
}
