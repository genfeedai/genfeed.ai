import type { CardImageProps } from '@mcp/shared/interfaces/mcp-preview.interface';

/**
 * Stands in for `next/image` inside the card bundle. The real component is a
 * CommonJS module that esbuild hands over as a plain object in this build, so
 * any shared component that rendered it (a video thumbnail, a failed video)
 * crashed the whole card. A card has no Next image optimizer to call anyway.
 */
export default function Image({
  alt,
  fill = false,
  priority: _priority,
  quality: _quality,
  unoptimized: _unoptimized,
  style,
  ...props
}: CardImageProps) {
  return (
    <img
      referrerPolicy="no-referrer"
      {...props}
      alt={alt}
      style={
        fill
          ? {
              height: '100%',
              inset: 0,
              position: 'absolute',
              width: '100%',
              ...style,
            }
          : style
      }
    />
  );
}
