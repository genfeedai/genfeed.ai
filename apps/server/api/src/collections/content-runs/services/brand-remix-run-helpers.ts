import {
  type BrandRemixRunRecord,
  type GenerationDimensions,
  MAX_ERROR_LENGTH,
} from '@api/collections/content-runs/services/brand-remix-runs.types';
import type { BrandRemixSourceSnapshot } from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import { CredentialPlatform, Prisma } from '@genfeedai/prisma';
import { BadRequestException, ConflictException } from '@nestjs/common';
import type { ZodError, ZodType } from 'zod';

export function parseBrandRemixPayload<T>(
  schema: ZodType<T>,
  body: unknown,
  action: string,
): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw invalidBrandRemixPayload(action, parsed.error);
  return parsed.data;
}

export function invalidBrandRemixPayload(
  action: string,
  error: ZodError,
): BadRequestException {
  return new BadRequestException({
    detail: error.issues
      .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
      .join('; '),
    title: `Invalid brand remix ${action} payload`,
  });
}

export function requireBrandRemixBrandId(run: BrandRemixRunRecord): string {
  if (!run.brandId) {
    throw new ConflictException('Brand remix run has no owning brand.');
  }
  return run.brandId;
}

export function staleRemixRevision(
  expected: number,
  actual: number,
): ConflictException {
  return new ConflictException({
    detail: `Expected remix revision ${expected}, but the current revision is ${actual}.`,
    title: 'Stale remix revision',
  });
}

export function remixText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function remixTruncate(value: string, max = 1_000): string {
  return Array.from(value.trim()).slice(0, max).join('');
}

export function remixRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function remixNumericRecord(value: unknown): Record<string, number> {
  return Object.fromEntries(
    Object.entries(remixRecord(value)).flatMap(([key, entry]) =>
      typeof entry === 'number' && Number.isFinite(entry)
        ? [[key.slice(0, 100), entry]]
        : [],
    ),
  );
}

export function remixStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((entry) =>
        typeof entry === 'string' && entry.trim() ? [remixTruncate(entry)] : [],
      )
    : [];
}

export function remixPublicUrl(value: unknown): string | undefined {
  const text = remixText(value);
  if (!text) return undefined;
  try {
    const url = new URL(text);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? `${url.origin}${url.pathname}`
      : undefined;
  } catch {
    return undefined;
  }
}

export function remixIso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

export function remixToJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function remixErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return remixTruncate(message || 'Generation failed', MAX_ERROR_LENGTH);
}

export function remixSourcePlatform(
  value: unknown,
): BrandRemixSourceSnapshot['platform'] {
  const normalized = remixText(value)?.toLowerCase();
  if (
    normalized === 'tiktok' ||
    normalized === 'instagram' ||
    normalized === 'youtube' ||
    normalized === 'meta' ||
    normalized === 'google' ||
    normalized === 'x'
  ) {
    return normalized;
  }
  if (normalized === 'facebook' || normalized === 'facebook_ads') return 'meta';
  if (normalized === 'google_ads') return 'google';
  if (normalized === 'twitter' || normalized === 'x_ads') return 'x';
  throw new BadRequestException({
    detail: `Source platform ${normalized ?? 'unknown'} is not supported for a brand remix.`,
    title: 'Unsupported remix source platform',
  });
}

export function remixOrganicPlatform(
  platform: BrandRemixSourceSnapshot['platform'],
): 'instagram' | 'tiktok' | 'youtube' {
  if (
    platform === 'instagram' ||
    platform === 'tiktok' ||
    platform === 'youtube'
  ) {
    return platform;
  }
  throw new BadRequestException({
    detail: `Organic remix output is not supported for ${platform}. Choose Instagram, TikTok, or YouTube.`,
    title: 'Unsupported organic remix target',
  });
}

export function remixCredentialPlatform(
  platform: 'google' | 'meta' | 'tiktok' | 'x',
): CredentialPlatform {
  if (platform === 'meta') return CredentialPlatform.FACEBOOK;
  if (platform === 'google') return CredentialPlatform.GOOGLE_ADS;
  if (platform === 'x') return CredentialPlatform.X_ADS;
  return CredentialPlatform.TIKTOK;
}

export function remixIsVideoMedia(kind: unknown, urls: string[] = []): boolean {
  const normalizedKind = remixText(kind)?.toLowerCase() ?? '';
  if (
    normalizedKind.includes('video') ||
    normalizedKind.includes('reel') ||
    normalizedKind.includes('short')
  ) {
    return true;
  }
  return urls.some((value) => {
    try {
      return /\.(?:m4v|mov|mp4|webm)$/i.test(new URL(value).pathname);
    } catch {
      return /\.(?:m4v|mov|mp4|webm)(?:$|[?#])/i.test(value);
    }
  });
}

export function remixPatternFromText(
  text: string,
  mediaKind?: string,
): BrandRemixSourceSnapshot['pattern'] {
  const normalized = text.toLowerCase();
  const usesTransformation =
    /\b(after|before|but|instead|new|old|then|transform)\b/.test(normalized);
  const usesInstruction = /\b(how|step|steps|tip|tips|way|ways)\b/.test(
    normalized,
  );
  const usesSpecificResult = /\b\d+(?:[.,]\d+)?%?\b/.test(normalized);
  const usesQuestion = text.includes('?');
  const hook = usesQuestion
    ? 'Question-led curiosity hook.'
    : usesSpecificResult
      ? 'Specific-result-led hook.'
      : usesInstruction
        ? 'Instruction-led value hook.'
        : usesTransformation
          ? 'Problem-to-transformation hook.'
          : 'Outcome-led relevance hook.';
  const structure = usesInstruction
    ? 'State the useful outcome, demonstrate concise steps, provide proof, then close with a brand-specific action.'
    : usesTransformation
      ? 'Establish the friction, reveal the transformation, provide proof, then close with a brand-specific action.'
      : 'Lead with a clear outcome, support it with proof, then close with a brand-specific action.';
  const isVideo = mediaKind?.toLowerCase().includes('video') === true;
  return {
    hook,
    pacing: isVideo
      ? 'Fast opening, one clear proof beat, and a decisive close.'
      : undefined,
    structure,
    visualDirection: isVideo
      ? 'Use an original motion-led execution centered on the brand identity and product.'
      : 'Use an original brand-owned composition centered on the product and intended outcome.',
  };
}

export function remixDimensions(aspectRatio: string): GenerationDimensions {
  switch (aspectRatio) {
    case '9:16':
      return { height: 1920, width: 1080 };
    case '16:9':
      return { height: 1080, width: 1920 };
    case '4:5':
      return { height: 1350, width: 1080 };
    default:
      return { height: 1024, width: 1024 };
  }
}

export function remixAvatarAspectRatio(value: string): '1:1' | '9:16' | '16:9' {
  return value === '16:9' || value === '1:1' ? value : '9:16';
}
