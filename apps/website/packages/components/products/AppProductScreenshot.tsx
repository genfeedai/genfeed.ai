import Image from 'next/image';

interface AppProductScreenshotProps {
  alt: string;
  isPriority?: boolean;
  src: string;
}

/**
 * A real capture of the app page, never a hand-built mock. The frame is only
 * a border and a shadow: the pixels are the product.
 */
export default function AppProductScreenshot({
  alt,
  isPriority = false,
  src,
}: AppProductScreenshotProps): React.ReactElement {
  return (
    <figure className="w-full max-w-[760px] overflow-hidden rounded-2xl border border-edge/15 bg-background shadow-[0_32px_100px_rgba(0,0,0,0.35)]">
      <Image
        alt={alt}
        className="h-auto w-full"
        height={900}
        priority={isPriority}
        sizes="(max-width: 1024px) 100vw, 760px"
        src={src}
        width={1440}
      />
    </figure>
  );
}
