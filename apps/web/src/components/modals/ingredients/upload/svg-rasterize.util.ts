/**
 * Library uploads never send an SVG to storage: a stored SVG is a scriptable
 * document on the media origin, so the server rejects the type. The browser
 * rasterizes it to a transparent PNG first (#8991). Decoding an SVG through an
 * `<img>` never runs its script or loads its external references.
 */
const SVG_MIME_TYPE = 'image/svg+xml';
const FALLBACK_SIDE_PX = 512;
const MAX_SCALE = 4;
const MAX_SIDE_PX = 2048;

export interface SvgSize {
  height: number;
  width: number;
}

export function isSvgUpload(file: File): boolean {
  return (
    file.type.toLowerCase() === SVG_MIME_TYPE ||
    (file.type === '' && /\.svg$/i.test(file.name))
  );
}

function parseLength(value: string | null): number | undefined {
  const match = /^\s*([0-9]*\.?[0-9]+)\s*(px)?\s*$/i.exec(value ?? '');
  const length = match ? Number(match[1]) : Number.NaN;
  return Number.isFinite(length) && length > 0 ? length : undefined;
}

/** Nominal size from `width`/`height`, else the `viewBox`, else undefined. */
export function readSvgSize(markup: string): SvgSize | undefined {
  const root = new DOMParser().parseFromString(
    markup,
    SVG_MIME_TYPE,
  ).documentElement;
  if (root.localName !== 'svg' || root.querySelector('parsererror')) {
    return undefined;
  }

  const viewBox = (root.getAttribute('viewBox') ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const [, , boxWidth, boxHeight] = viewBox;
  const hasViewBox =
    viewBox.length === 4 &&
    boxWidth > 0 &&
    boxHeight > 0 &&
    viewBox.every(Number.isFinite);

  const width = parseLength(root.getAttribute('width'));
  const height = parseLength(root.getAttribute('height'));
  if (width && height) {
    return { height, width };
  }
  if (hasViewBox) {
    // One explicit side keeps the viewBox aspect ratio.
    if (width) {
      return { height: (width * boxHeight) / boxWidth, width };
    }
    if (height) {
      return { height, width: (height * boxWidth) / boxHeight };
    }
    return { height: boxHeight, width: boxWidth };
  }
  return undefined;
}

/**
 * Raster size: up to 4x the nominal size so a small logo stays crisp, never
 * past a 2048px longest side, and a 512px square when the SVG declares none.
 */
export function resolveRasterSize(size: SvgSize | undefined): SvgSize {
  if (!size) {
    return { height: FALLBACK_SIDE_PX, width: FALLBACK_SIDE_PX };
  }
  const scale = Math.min(
    MAX_SCALE,
    MAX_SIDE_PX / Math.max(size.width, size.height),
  );
  return {
    height: Math.max(1, Math.round(size.height * scale)),
    width: Math.max(1, Math.round(size.width * scale)),
  };
}

function loadSvgImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('The SVG could not be read. Upload a valid SVG file.'));
    };
    image.src = objectUrl;
  });
}

/** Renders an SVG upload to a transparent PNG named after the original. */
export async function rasterizeSvgFile(file: File): Promise<File> {
  const markup = await file.text();
  const { height, width } = resolveRasterSize(readSvgSize(markup));
  const image = await loadSvgImage(new Blob([markup], { type: SVG_MIME_TYPE }));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('This browser cannot convert SVG files. Upload a PNG.');
  }
  context.drawImage(image, 0, 0, width, height);

  const png = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png'),
  );
  if (!png) {
    throw new Error('The SVG could not be converted. Upload a PNG instead.');
  }
  return new File([png], `${file.name.replace(/\.svg$/i, '')}.png`, {
    lastModified: file.lastModified,
    type: 'image/png',
  });
}
