import { createHmac, timingSafeEqual } from 'node:crypto';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { requireStoredMediaKey } from '@api/services/media-urls/media-delivery-policy.util';
import { MediaUrlService } from '@api/services/media-urls/media-url.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { IngredientCategory } from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

/** An email is read for weeks; the link keeps working that long. */
export const EMAIL_MEDIA_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

const TOKEN_DOMAIN = 'genfeed-email-media-v1';
const THUMBNAIL_STORAGE_PREFIX = 'ingredients/thumbnails/';

interface EmailMediaClaim {
  /** Ingredient id. */
  i: string;
  /** Organization id; the lookup is scoped to it. */
  o: string;
  /** Expiry, epoch seconds. */
  e: number;
}

/**
 * Previews for generated media in emails.
 *
 * Once authorized media delivery is on, ingredient objects are only reachable
 * through short-lived CloudFront signatures, and an email bakes its image URLs
 * in at send time and is opened hours or weeks later. So the email carries a
 * stable link to the API instead: an HMAC-signed claim naming one ingredient
 * in one organization. Opening it checks the claim, reads the ingredient inside
 * that organization and redirects to a freshly signed CDN URL. The claim opens
 * one still (an image, or a video's thumbnail), nothing else, and expires.
 */
@Traced()
@Injectable()
export class EmailMediaUrlService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly urls: MediaUrlService,
  ) {}

  /**
   * The URL an email puts in an `<img>` for an image or video; `null` for other
   * categories or when nothing can be shown (the email then draws a tile).
   */
  previewUrl(
    asset: { id: string; category: string },
    organizationId: string,
    now = Date.now(),
  ): string | null {
    if (
      asset.category !== IngredientCategory.IMAGE &&
      asset.category !== IngredientCategory.VIDEO
    )
      return null;
    if (!this.config.isAuthorizedMediaDeliveryEnabled) {
      // Not signed on this deployment: the CDN still is public.
      const endpoint = this.config.ingredientsEndpoint;
      if (!endpoint) return null;
      return asset.category === IngredientCategory.VIDEO
        ? `${endpoint}/thumbnails/${asset.id}`
        : `${endpoint}/images/${asset.id}`;
    }
    const token = this.sign({
      e: Math.floor((now + EMAIL_MEDIA_TOKEN_TTL_MS) / 1000),
      i: asset.id,
      o: organizationId,
    });
    return token
      ? `${this.config.apiUrl}/email-media/${encodeURIComponent(token)}`
      : null;
  }

  /** The signed CDN URL a valid claim stands for; throws when it stands for none. */
  async resolve(token: string, now = Date.now()): Promise<string> {
    const claim = this.verify(token, now);
    if (!claim) throw new NotFoundException('Preview is unavailable');
    const ingredient = await runWithTenantContext(
      { organizationId: claim.o },
      () =>
        this.prisma.ingredient.findFirst({
          select: { category: true, id: true, s3Key: true },
          where: scopedWhere(claim.o, {
            category: {
              in: [IngredientCategory.IMAGE, IngredientCategory.VIDEO],
            },
            id: claim.i,
          }),
        }),
    );
    if (!ingredient) throw new NotFoundException('Preview is unavailable');
    // A key the media policy would refuse to sign is no preview either.
    try {
      return this.urls.buildUrl(
        requireStoredMediaKey({
          s3Key:
            ingredient.category === IngredientCategory.VIDEO
              ? `${THUMBNAIL_STORAGE_PREFIX}${ingredient.id}`
              : ingredient.s3Key,
        }),
      );
    } catch {
      throw new NotFoundException('Preview is unavailable');
    }
  }

  private secret(): string | undefined {
    return this.config.cdnSigningPrivateKey;
  }

  private mac(payload: string, secret: string): Buffer {
    return createHmac('sha256', secret)
      .update(`${TOKEN_DOMAIN}.${payload}`)
      .digest();
  }

  private sign(claim: EmailMediaClaim): string | null {
    const secret = this.secret();
    if (!secret) return null;
    const payload = Buffer.from(JSON.stringify(claim)).toString('base64url');
    return `${payload}.${this.mac(payload, secret).toString('base64url')}`;
  }

  private verify(token: string, now: number): EmailMediaClaim | null {
    const secret = this.secret();
    const [payload, signature, ...rest] = token.split('.');
    if (!secret || !payload || !signature || rest.length > 0) return null;
    const expected = this.mac(payload, secret);
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      return null;
    try {
      const claim = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      ) as Partial<EmailMediaClaim>;
      if (
        typeof claim.i !== 'string' ||
        typeof claim.o !== 'string' ||
        typeof claim.e !== 'number' ||
        claim.e * 1000 < now
      )
        return null;
      return { e: claim.e, i: claim.i, o: claim.o };
    } catch {
      return null;
    }
  }
}
