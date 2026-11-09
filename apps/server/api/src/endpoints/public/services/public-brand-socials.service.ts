import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  CredentialPlatform,
  fromPrismaCredentialPlatform,
} from '@genfeedai/contracts';
import type { IPublicBrandSocial } from '@genfeedai/contracts/interfaces';
import { SocialUrlHelper } from '@genfeedai/helpers';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

/** The order socials appear in on a profile. */
const SOCIAL_ORDER: readonly CredentialPlatform[] = [
  CredentialPlatform.INSTAGRAM,
  CredentialPlatform.TIKTOK,
  CredentialPlatform.YOUTUBE,
  CredentialPlatform.TWITTER,
  CredentialPlatform.THREADS,
  CredentialPlatform.LINKEDIN,
  CredentialPlatform.FACEBOOK,
  CredentialPlatform.PINTEREST,
  CredentialPlatform.REDDIT,
];

const LEADING_AT = /^@/;

export interface PublicSocialCredential {
  externalHandle: string | null;
  externalId: string | null;
  platform: string;
  username: string | null;
}

/**
 * A brand's connected accounts as public profile links, one per platform, in
 * profile order. An account without a public handle, or on a platform that
 * has no public profile page (ads, analytics), is left out.
 */
export function toPublicSocials(
  credentials: readonly PublicSocialCredential[],
): IPublicBrandSocial[] {
  const byPlatform = new Map<CredentialPlatform, IPublicBrandSocial>();
  for (const credential of credentials) {
    const platform = fromPrismaCredentialPlatform(credential.platform);
    const handle = (credential.externalHandle || credential.username)
      ?.trim()
      .replace(LEADING_AT, '');
    if (!platform || !SOCIAL_ORDER.includes(platform) || !handle) {
      continue;
    }
    const url = SocialUrlHelper.buildProfileUrl(
      platform,
      handle,
      credential.externalId,
    );
    if (url && !byPlatform.has(platform)) {
      byPlatform.set(platform, { handle, platform, url });
    }
  }
  return SOCIAL_ORDER.flatMap((platform) => {
    const social = byPlatform.get(platform);
    return social ? [social] : [];
  });
}

/**
 * Reads the connected social accounts of a public brand. Only the platform
 * and the public handle leave the credential row; tokens and ids stay in.
 */
@Traced()
@Injectable()
export class PublicBrandSocialsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The brand with its socials attached, ready to serialize. */
  async attach<T extends { id: string; organizationId?: string | null }>(
    brand: T,
  ): Promise<T & { socials: IPublicBrandSocial[] }> {
    const socials = brand.organizationId
      ? await this.findForBrand(brand.id, brand.organizationId)
      : [];
    return Object.assign(brand, { socials });
  }

  async findForBrand(
    brandId: string,
    organizationId: string,
  ): Promise<IPublicBrandSocial[]> {
    const credentials = await this.prisma.credential.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        externalHandle: true,
        externalId: true,
        platform: true,
        username: true,
      },
      where: scopedWhere(organizationId, { brandId }),
    });
    return toPublicSocials(credentials);
  }
}
