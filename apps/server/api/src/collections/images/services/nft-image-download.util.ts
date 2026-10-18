import { downloadBounded } from '@libs/security/bounded-download';
import { BadRequestException } from '@nestjs/common';

export async function downloadNftImage(
  imageUrl: string,
  maxBytes: number,
): Promise<{ contentType: string; data: Buffer }> {
  let contentType = 'image/jpeg';
  const { data } = await downloadBounded(imageUrl, {
    createError: (reason) =>
      reason === 'failed'
        ? new Error('NFT image could not be downloaded')
        : new BadRequestException('NFT image exceeds the upload size limit'),
    deadlineMs: 30_000,
    destination: { allowedSchemes: ['http:', 'https:'] },
    inspect: (response) => {
      contentType = response.headers.get('content-type') ?? contentType;
      if (!contentType.startsWith('image/')) {
        throw new BadRequestException('NFT is not an image');
      }
    },
    maxBytes,
    timeoutError: new Error('NFT image download timed out'),
  });
  return { contentType, data };
}
