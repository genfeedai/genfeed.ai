import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ConfigService } from '@libs/config/config.service';
import { resolveIngredientMediaUrl } from '@libs/media/media-url.util';
import { assertSafeObjectKey } from '@libs/security';
import { BadRequestException, Injectable } from '@nestjs/common';

/** Client references must resolve to a live video in this workspace. */
@Injectable()
export class ClipProjectClientSourceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async resolve(
    input: { sourceVideoS3Key?: string; sourceVideoUrl?: string },
    organizationId: string,
    brandId?: string | null,
  ): Promise<{ sourceVideoS3Key: string | undefined; sourceVideoUrl: string }> {
    const suppliedKey = input.sourceVideoS3Key;
    const suppliedUrl = input.sourceVideoUrl;
    if (
      (suppliedKey !== undefined &&
        (typeof suppliedKey !== 'string' || !suppliedKey)) ||
      (suppliedUrl !== undefined &&
        (typeof suppliedUrl !== 'string' || !suppliedUrl)) ||
      (!suppliedKey && !suppliedUrl)
    ) {
      throw new BadRequestException(
        'A source must identify an owned Library video.',
      );
    }
    const key =
      suppliedKey ?? (suppliedUrl ? this.readCdnKey(suppliedUrl) : undefined);
    if (key) {
      assertSafeObjectKey(key, (message) => new BadRequestException(message));
    }
    const ingredient = await this.prisma.ingredient.findFirst({
      select: { metadata: { select: { result: true } }, s3Key: true },
      where: scopedWhere(organizationId, {
        category: 'VIDEO',
        ...(brandId ? { OR: [{ brandId }, { brandId: null }] } : {}),
        ...(key
          ? { s3Key: key }
          : { metadata: { is: { isDeleted: false, result: suppliedUrl } } }),
      }),
    });
    const canonicalUrl = ingredient
      ? resolveIngredientMediaUrl(ingredient, this.config.cdnUrl)
      : undefined;
    if (
      !ingredient ||
      !canonicalUrl ||
      (suppliedUrl && !this.sameMediaUrl(suppliedUrl, canonicalUrl))
    ) {
      throw new BadRequestException(
        'A source must identify an owned Library video. Use the upload, YouTube or Library ingestion routes.',
      );
    }
    return {
      sourceVideoS3Key: ingredient.s3Key ?? undefined,
      sourceVideoUrl: canonicalUrl,
    };
  }

  private readCdnKey(value: string): string | undefined {
    try {
      const url = new URL(value);
      const cdn = new URL(`${this.config.cdnUrl.replace(/\/+$/, '')}/`);
      if (url.origin !== cdn.origin || !url.pathname.startsWith(cdn.pathname))
        return undefined;
      return decodeURIComponent(url.pathname.slice(cdn.pathname.length));
    } catch {
      throw new BadRequestException('Invalid clip source URL.');
    }
  }

  private sameMediaUrl(supplied: string, canonical: string): boolean {
    // CDN signatures identify the same stored object; external URLs must
    // match the record verbatim, including their query parameters.
    const key = this.readCdnKey(supplied);
    return key !== undefined
      ? key === this.readCdnKey(canonical)
      : supplied === canonical;
  }
}
