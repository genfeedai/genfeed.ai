import {
  BRAND_BANNER_ASPECT_RATIO,
  BRAND_BANNER_HEIGHT,
  BRAND_BANNER_WIDTH,
} from '@genfeedai/contracts/constants';

const JPEG_MIME_PATTERN = /^image\/jpe?g$/i;
const FILE_EXTENSION_PATTERN = /\.[^.]+$/;

/**
 * A brand banner defaults to the X header format (1500x500, 3:1); a platform
 * image slot passes its own size. The upload crops whatever the owner picked
 * to that ratio, centered, so the stored file is exactly what the platform
 * displays and accepts.
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

const DEFAULT_BANNER_SIZE: BannerOutputSize = {
  height: BRAND_BANNER_HEIGHT,
  width: BRAND_BANNER_WIDTH,
};

export function isBannerRatio(
  width: number,
  height: number,
  ratio: number = BRAND_BANNER_ASPECT_RATIO,
): boolean {
  return (
    height > 0 && Math.abs(width / height - ratio) <= BANNER_RATIO_TOLERANCE
  );
}

/** The largest centered rectangle of the target ratio inside an image. */
export function resolveCenterCropRect(
  imageWidth: number,
  imageHeight: number,
  ratio: number = BRAND_BANNER_ASPECT_RATIO,
): CropRect {
  if (imageWidth / imageHeight > ratio) {
    const width = Math.round(imageHeight * ratio);
    return {
      height: imageHeight,
      width,
      x: Math.round((imageWidth - width) / 2),
      y: 0,
    };
  }
  const height = Math.round(imageWidth / ratio);
  return {
    height,
    width: imageWidth,
    x: 0,
    y: Math.round((imageHeight - height) / 2),
  };
}

/** Scale down to the target size; a smaller crop keeps its size rather than upscale. */
export function resolveBannerOutputSize(
  crop: CropRect,
  target: BannerOutputSize = DEFAULT_BANNER_SIZE,
): BannerOutputSize {
  if (crop.width >= target.width) {
    return target;
  }
  return {
    height: Math.max(
      1,
      Math.round((crop.width * target.height) / target.width),
    ),
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

/**
 * Crops an image upload to the banner frame, or to a platform slot's size when
 * one is given. A file already at the ratio and no larger is returned as is.
 */
export async function cropFileToBanner(
  file: File,
  target: BannerOutputSize = DEFAULT_BANNER_SIZE,
): Promise<File> {
  const ratio = target.width / target.height;
  const image = await loadImage(file);
  if (
    isBannerRatio(image.naturalWidth, image.naturalHeight, ratio) &&
    image.naturalWidth <= target.width
  ) {
    return file;
  }

  const crop = resolveCenterCropRect(
    image.naturalWidth,
    image.naturalHeight,
    ratio,
  );
  const output = resolveBannerOutputSize(crop, target);
  const canvas = document.createElement('canvas');
  canvas.width = output.width;
  canvas.height = output.height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error(
      `This browser cannot crop images. Upload a ${target.width}x${target.height} image.`,
    );
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

  const isJpeg = JPEG_MIME_PATTERN.test(file.type);
  const type = isJpeg ? 'image/jpeg' : 'image/png';
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, isJpeg ? 0.92 : undefined),
  );
  if (!blob) {
    throw new Error('The banner could not be cropped. Try another image.');
  }
  const extension = isJpeg ? 'jpg' : 'png';
  return new File(
    [blob],
    `${file.name.replace(FILE_EXTENSION_PATTERN, '')}.${extension}`,
    {
      lastModified: file.lastModified,
      type,
    },
  );
}
