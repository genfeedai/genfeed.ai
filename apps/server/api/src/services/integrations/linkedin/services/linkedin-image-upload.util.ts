import {
  downloadLinkedInMedia,
  type LinkedInMediaSource,
} from '@api/services/integrations/linkedin/services/linkedin-media-download.util';
import type { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

/**
 * Version header of the versioned `/rest` APIs (Images and Posts), which carry
 * multi-image posts. Versions are supported for about a year, so bump this
 * when LinkedIn sunsets it.
 */
export const LINKEDIN_REST_VERSION = '202610';
const LINKEDIN_REST_BASE_URL = 'https://api.linkedin.com/rest';
/** A multi-image post takes 2 to 20 images (Posts API, multiImage). */
export const LINKEDIN_MULTI_IMAGE_LIMITS = { max: 20, min: 2 } as const;

interface LinkedInUploadContext {
  httpService: HttpService;
  ingredientsEndpoint: string;
}

/**
 * Register a digital media asset and upload the image bytes behind it.
 *
 * Shared by feed shares and comment attachments: both reference the same
 * `urn:li:digitalmediaAsset` once the upload completes.
 */
export async function uploadLinkedInImageAsset(
  { httpService, ingredientsEndpoint }: LinkedInUploadContext,
  accessToken: string,
  ownerUrn: string,
  imageUrl: string,
  mediaSource: LinkedInMediaSource,
): Promise<string> {
  const registerResponse = await firstValueFrom(
    httpService.post(
      'https://api.linkedin.com/v2/assets?action=registerUpload',
      {
        registerUploadRequest: {
          owner: ownerUrn,
          recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
          serviceRelationships: [
            {
              identifier: 'urn:li:userGeneratedContent',
              relationshipType: 'OWNER',
            },
          ],
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      },
    ),
  );

  const assetId = registerResponse.data.value.asset;
  const uploadUrl =
    registerResponse.data.value.uploadMechanism[
      'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'
    ].uploadUrl;

  const image = await downloadLinkedInMedia(
    imageUrl,
    'image',
    ingredientsEndpoint,
    mediaSource,
  );

  await firstValueFrom(
    httpService.put(uploadUrl, image, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/octet-stream',
      },
    }),
  );

  return assetId;
}

/** Upload one image through the versioned Images API and return its URN. */
async function uploadLinkedInRestImage(
  { httpService, ingredientsEndpoint }: LinkedInUploadContext,
  headers: Record<string, string>,
  ownerUrn: string,
  imageUrl: string,
  mediaSource: LinkedInMediaSource,
): Promise<string> {
  const initialized = await firstValueFrom(
    httpService.post(
      `${LINKEDIN_REST_BASE_URL}/images?action=initializeUpload`,
      { initializeUploadRequest: { owner: ownerUrn } },
      { headers },
    ),
  );

  const uploadUrl: unknown = initialized.data?.value?.uploadUrl;
  const imageUrn: unknown = initialized.data?.value?.image;
  if (typeof uploadUrl !== 'string' || typeof imageUrn !== 'string') {
    throw new Error('LinkedIn did not return an image upload target');
  }

  const image = await downloadLinkedInMedia(
    imageUrl,
    'image',
    ingredientsEndpoint,
    mediaSource,
  );

  await firstValueFrom(
    httpService.put(uploadUrl, image, {
      headers: {
        Authorization: headers.Authorization,
        'Content-Type': 'application/octet-stream',
      },
    }),
  );

  return imageUrn;
}

/**
 * Publish one post holding several images, in the order given. Multi-image
 * posts exist only on the versioned Posts API, which takes `urn:li:image` ids
 * from the Images API, so this does not share the legacy asset upload.
 * Resolves with the new post's URN, or null when LinkedIn returned none.
 */
export async function createLinkedInMultiImagePost(
  context: LinkedInUploadContext,
  params: {
    accessToken: string;
    authorUrn: string;
    caption: string;
    imageUrls: readonly string[];
    mediaSource: LinkedInMediaSource;
    visibility: string;
  },
): Promise<string | null> {
  const { accessToken, authorUrn, caption, imageUrls, mediaSource } = params;
  if (
    imageUrls.length < LINKEDIN_MULTI_IMAGE_LIMITS.min ||
    imageUrls.length > LINKEDIN_MULTI_IMAGE_LIMITS.max
  ) {
    throw new Error(
      `LinkedIn multi-image posts take ${LINKEDIN_MULTI_IMAGE_LIMITS.min} to ${LINKEDIN_MULTI_IMAGE_LIMITS.max} images`,
    );
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Linkedin-Version': LINKEDIN_REST_VERSION,
    'X-Restli-Protocol-Version': '2.0.0',
  };

  // One at a time: the post lists the images in this order, and a failed
  // upload should stop before more bytes are sent.
  const imageUrns: string[] = [];
  for (const imageUrl of imageUrls) {
    imageUrns.push(
      await uploadLinkedInRestImage(
        context,
        headers,
        authorUrn,
        imageUrl,
        mediaSource,
      ),
    );
  }

  const response = await firstValueFrom(
    context.httpService.post(
      `${LINKEDIN_REST_BASE_URL}/posts`,
      {
        author: authorUrn,
        commentary: caption,
        content: { multiImage: { images: imageUrns.map((id) => ({ id })) } },
        distribution: {
          feedDistribution: 'MAIN_FEED',
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        isReshareDisabledByAuthor: false,
        lifecycleState: 'PUBLISHED',
        visibility: params.visibility,
      },
      { headers },
    ),
  );

  // The Posts API answers 201 with the new post's URN in a header.
  const rawId: unknown = response.headers?.['x-restli-id'];
  return typeof rawId === 'string' && rawId.length > 0 ? rawId : null;
}
