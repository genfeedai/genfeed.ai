import { normalizeExtensionPublication } from '@api/collections/posts/services/post-publication-capture.util';
import { FORBID_NON_WHITELISTED } from '@api/helpers/pipes/validation.pipe';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import type { ExtensionPublicationPlatform } from '@genfeedai/contracts/interfaces/content/extension-publication.interface';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateBy,
} from 'class-validator';

export class PublicationInsightScopeQueryDto {
  static readonly [FORBID_NON_WHITELISTED] = true;
  @IsEntityId()
  brandId!: string;
}

function validLookup(query: PublicationInsightsQueryDto): boolean {
  if (!(query.externalId || query.pageUrl)) return true;
  if (!query.platform) return false;
  if (!query.pageUrl) return true;
  try {
    const url = new URL(query.pageUrl);
    const reply =
      ['commentUrn', 'lc', 'comment_id', 'reply_comment_id'].some((key) =>
        url.searchParams.has(key),
      ) ||
      (query.platform === 'reddit' &&
        /^\/(?:r\/[^/]+\/)?comments\/[^/]+\/[^/]+\/[^/]+\/?$/.test(
          url.pathname,
        ));
    normalizeExtensionPublication({
      platform: query.platform,
      publicationKind: reply ? 'reply' : 'post',
      url: query.pageUrl,
    });
    return true;
  } catch {
    return false;
  }
}

export class PublicationInsightsQueryDto extends PublicationInsightScopeQueryDto {
  @ValidateBy({
    name: 'publicationLookup',
    validator: {
      validate: (_value, args) =>
        validLookup(args?.object as PublicationInsightsQueryDto),
    },
  })
  @IsEntityId()
  override brandId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 10;

  @IsOptional()
  @IsIn([
    'twitter',
    'linkedin',
    'reddit',
    'youtube',
    'instagram',
    'facebook',
    'tiktok',
  ])
  platform?: ExtensionPublicationPlatform;

  @IsOptional()
  @IsIn(['extension'])
  source?: 'extension';

  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  capturedOnly?: boolean;

  @IsOptional()
  @Transform(({ value }) =>
    Array.isArray(value)
      ? [...new Set(value)]
      : typeof value === 'string'
        ? [value]
        : value,
  )
  @IsArray()
  @ArrayMaxSize(100)
  @IsEntityId({ each: true })
  credentialId?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(256)
  externalId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @IsUrl({ protocols: ['https'], require_protocol: true })
  pageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  search?: string;
}
