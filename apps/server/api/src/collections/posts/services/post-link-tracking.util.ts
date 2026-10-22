import { normalizeExtensionPublication } from '@api/collections/posts/services/post-publication-capture.util';
import { isEntityId } from '@genfeedai/contracts/api-types/helpers/entity-id';
import type {
  ExtensionPublicationCaptureInput,
  TrackPostLinkInput,
} from '@genfeedai/contracts/interfaces/content/extension-publication.interface';
import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

const inputSchema = z
  .object({
    brandId: z.string().refine(isEntityId),
    url: z.string().trim().min(1).max(2048),
    title: z.string().max(10000).optional(),
    publishedAt: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

export function parseTrackPostLinkInput(input: unknown): TrackPostLinkInput {
  const result = inputSchema.safeParse(input);
  if (!result.success)
    throw new BadRequestException('Invalid post link tracking input');
  return result.data;
}

export function normalizeTrackedPostLink(
  raw: string,
): ReturnType<typeof normalizeExtensionPublication> &
  Pick<ExtensionPublicationCaptureInput, 'platform'> {
  let host: string;
  try {
    host = new URL(raw).hostname.replace(/^www\./, '');
  } catch {
    throw new BadRequestException('Enter a valid HTTPS post link');
  }
  const platform =
    host === 'x.com' || host === 'twitter.com'
      ? 'twitter'
      : host === 'youtube.com' || host === 'youtu.be'
        ? 'youtube'
        : host === 'linkedin.com'
          ? 'linkedin'
          : null;
  if (!platform)
    throw new BadRequestException(
      'Supported platforms are X, YouTube and LinkedIn',
    );
  return {
    platform,
    ...normalizeExtensionPublication({
      platform,
      publicationKind: 'post',
      url: raw,
    }),
  };
}

export function linkedInActivityDate(
  id: string | undefined,
  now = new Date(),
): Date | null {
  if (!id || !/^\d{1,25}$/.test(id)) return null;
  const timestamp = Number(BigInt(id) >> 22n);
  return timestamp >= Date.UTC(2003, 0, 1) &&
    timestamp <= now.getTime() + 5 * 60 * 1000
    ? new Date(timestamp)
    : null;
}
