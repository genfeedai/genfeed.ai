import {
  BRAND_BANNER_ASPECT_RATIO,
  BRAND_BANNER_HEIGHT,
  BRAND_BANNER_WIDTH,
} from '@genfeedai/contracts/constants';

/**
 * A brand banner is always the X header format (1500x500, 3:1). The upload
 * crops whatever the owner picked to that ratio, centered, so the stored file
 * is exactly what every surface displays and what X accepts on export.
 */
export interface CropRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface BannerOutputSize {
  height: number;
  width: number;
}

const BANNER_RATIO_TOLERANCE = 0.01;

export function isBannerRatio(width: number, height: number): boolean {
  return (
    height > 0 &&
    Math.abs(width / height - BRAND_BANNER_ASPECT_RATIO) <=
      BANNER_RATIO_TOLERANCE
  );
}

/** The largest centered 3:1 rectangle inside an image. */
export function resolveCenterCropRect(
  imageWidth: number,
  imageHeight: number,
): CropRect {
  if (imageWidth / imageHeight > BRAND_BANNER_ASPECT_RATIO) {
    const width = Math.round(imageHeight * BRAND_BANNER_ASPECT_RATIO);
    return {
      height: imageHeight,
      width,
      x: Math.round((imageWidth - width) / 2),
      y: 0,
    };
  }
  const height = Math.round(imageWidth / BRAND_BANNER_ASPECT_RATIO);
  return {
    height,
    width: imageWidth,
    x: 0,
    y: Math.round((imageHeight - height) / 2),
  };
}

/** Scale down to 1500x500; a smaller crop keeps its size rather than upscale. */
export function resolveBannerOutputSize(crop: CropRect): BannerOutputSize {
  if (crop.width >= BRAND_BANNER_WIDTH) {
    return { height: BRAND_BANNER_HEIGHT, width: BRAND_BANNER_WIDTH };
  }
  return {
    height: Math.max(1, Math.round(crop.width / BRAND_BANNER_ASPECT_RATIO)),
    width: crop.width,
  };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('The banner image could not be read.'));
    };
    image.src = objectUrl;
  });
}

/** Crops an image upload to the banner frame. A file already 3:1 is returned as is. */
export async function cropFileToBanner(file: File): Promise<File> {
  const image = await loadImage(file);
  if (
    isBannerRatio(image.naturalWidth, image.naturalHeight) &&
    image.naturalWidth <= BRAND_BANNER_WIDTH
  ) {
    return file;
  }

  const crop = resolveCenterCropRect(image.naturalWidth, image.naturalHeight);
  const output = resolveBannerOutputSize(crop);
  const canvas = document.createElement('canvas');
  canvas.width = output.width;
  canvas.height = output.height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('This browser cannot crop images. Upload a 3:1 image.');
  }
  context.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    output.width,
    output.height,
  );

  const isJpeg = /^image\/jpe?g$/i.test(file.type);
  const type = isJpeg ? 'image/jpeg' : 'image/png';
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, isJpeg ? 0.92 : undefined),
  );
  if (!blob) {
    throw new Error('The banner could not be cropped. Try another image.');
  }
  const extension = isJpeg ? 'jpg' : 'png';
  return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.${extension}`, {
    lastModified: file.lastModified,
    type,
  });
}
