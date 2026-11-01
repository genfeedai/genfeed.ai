import type { NextImageProps } from '~types/next-image';

/**
 * Stands in for `next/image` in the extension (see the `next/image` alias in
 * package.json). The extension is built by Plasmo, not Next, so the real
 * component would request `/_next/image?url=…` from the extension's own
 * origin, which has no image optimizer: every remote image, such as an X
 * avatar, failed to load.
 */
export default function NextImage({
  alt,
  blurDataURL: _blurDataURL,
  fill = false,
  placeholder: _placeholder,
  priority: _priority,
  quality: _quality,
  src,
  style,
  unoptimized: _unoptimized,
  ...props
}: NextImageProps) {
  return (
    <img
      referrerPolicy="no-referrer"
      {...props}
      alt={alt}
      src={typeof src === 'string' ? src : src.src}
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
