const MAI_IMAGE_ENDPOINT_PREFIX = 'microsoft/mai-image-2.7/';
const MAI_IMAGE_EDIT_ENDPOINT_SUFFIX = '/edit';
/** fal rejects an image with a side under 768 px or over 4,194,304 pixels. */
const MAI_IMAGE_MIN_SIDE = 768;
const MAI_IMAGE_MAX_PIXELS = 4_194_304;
const MAI_IMAGE_SIZE_MULTIPLE = 16;
/** The edit endpoints take one to five source images. */
const MAI_IMAGE_MAX_SOURCES = 5;

export interface MaiImageFalRequest {
  height: number;
  prompt: string;
  referenceImageUrls: readonly string[];
  width: number;
}

export function isMaiImageEndpoint(endpoint: string): boolean {
  return endpoint.startsWith(MAI_IMAGE_ENDPOINT_PREFIX);
}

/**
 * Fits a requested size to fal's limits for MAI-Image: both sides at least 768,
 * at most 4,194,304 pixels, each side a multiple of 16. A 9:16 request of
 * 576x1024 becomes 768x1360, about 1.04 MP, which the rate sheet's 1.05 MP
 * billing floor covers. Sizes inside the limits only snap down to a multiple of
 * 16, so billing never rests on more pixels than fal renders.
 */
export function fitMaiImageSize(size: { height: number; width: number }): {
  height: number;
  width: number;
} {
  const lift = Math.max(
    1,
    MAI_IMAGE_MIN_SIDE / Math.min(size.width, size.height),
  );
  const liftedWidth = size.width * lift;
  const liftedHeight = size.height * lift;
  const cap = Math.min(
    1,
    Math.sqrt(MAI_IMAGE_MAX_PIXELS / (liftedWidth * liftedHeight)),
  );
  const snap = (value: number): number =>
    Math.max(
      MAI_IMAGE_MIN_SIDE,
      Math.floor((value * cap) / MAI_IMAGE_SIZE_MULTIPLE) *
        MAI_IMAGE_SIZE_MULTIPLE,
    );
  return { height: snap(liftedHeight), width: snap(liftedWidth) };
}

/**
 * Builds the fal input for a MAI-Image endpoint, or returns undefined for any
 * other endpoint. The text endpoints take a prompt; the edit endpoints also
 * require the source images. Built from the request rather than a synced
 * contract so the first dispatch after a deploy never falls back to the legacy
 * single-image field.
 */
export function buildMaiImageFalInput(
  endpoint: string,
  request: MaiImageFalRequest,
): Record<string, unknown> | undefined {
  if (!isMaiImageEndpoint(endpoint)) return undefined;
  const input: Record<string, unknown> = {
    image_size: fitMaiImageSize(request),
    prompt: request.prompt,
  };
  if (!endpoint.endsWith(MAI_IMAGE_EDIT_ENDPOINT_SUFFIX)) return input;
  if (request.referenceImageUrls.length === 0) {
    throw new Error('MAI-Image edit needs at least one source image');
  }
  input.image_urls = request.referenceImageUrls.slice(0, MAI_IMAGE_MAX_SOURCES);
  return input;
}
