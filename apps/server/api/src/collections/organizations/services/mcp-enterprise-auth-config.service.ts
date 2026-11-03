import {
  resolveMcpResourceUrl,
  resolveOAuthIssuerUrl,
} from '@api/oauth/oauth-metadata.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { IMcpEnterpriseAuthSettings } from '@genfeedai/contracts/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { BadRequestException, Injectable } from '@nestjs/common';

/**
 * A trusted issuer is a plain https URL: no credentials, query or fragment.
 * It is kept exactly as written, trailing slash included, because assertions
 * are matched on the exact string (changing it would sign everyone out).
 */
export function parseTrustedIssuer(value: string): string {
  const issuer = value.trim();
  let url: URL;
  try {
    url = new URL(issuer);
  } catch {
    throw new BadRequestException('Trusted issuer must be a valid URL');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    issuer.includes('?') ||
    issuer.includes('#')
  ) {
    throw new BadRequestException(
      'Trusted issuer must be an https URL without credentials, query or fragment',
    );
  }
  return issuer;
}

@Injectable()
export class McpEnterpriseAuthConfigService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async get(organizationId: string): Promise<IMcpEnterpriseAuthSettings> {
    const config = await this.prisma.mcpEnterpriseAuthConfig.findUnique({
      where: { organizationId },
    });
    return this.toSettings(organizationId, config);
  }

  async save(
    organizationId: string,
    input: { isEnabled: boolean; trustedIssuer: string },
    updatedByUserId: string | undefined,
  ): Promise<IMcpEnterpriseAuthSettings> {
    const trustedIssuer = parseTrustedIssuer(input.trustedIssuer);
    // Trusting this server's own issuer would let its tokens act as assertions.
    if (trustedIssuer === resolveOAuthIssuerUrl(this.configService)) {
      throw new BadRequestException(
        'Trusted issuer must be your identity provider, not Genfeed',
      );
    }
    const config = await this.prisma.mcpEnterpriseAuthConfig.upsert({
      create: {
        isEnabled: input.isEnabled,
        organizationId,
        trustedIssuer,
        updatedByUserId,
      },
      update: { isEnabled: input.isEnabled, trustedIssuer, updatedByUserId },
      where: { organizationId },
    });
    return this.toSettings(organizationId, config);
  }

  async remove(organizationId: string): Promise<void> {
    await this.prisma.mcpEnterpriseAuthConfig.deleteMany({
      where: { organizationId },
    });
  }

  private toSettings(
    organizationId: string,
    config: { isEnabled: boolean; trustedIssuer: string } | null,
  ): IMcpEnterpriseAuthSettings {
    const issuer = resolveOAuthIssuerUrl(this.configService);
    return {
      audience: issuer,
      isEnabled: config?.isEnabled ?? false,
      resource: resolveMcpResourceUrl(this.configService),
      tenantId: organizationId,
      tokenEndpoint: `${issuer}/v1/oauth/token`,
      trustedIssuer: config?.trustedIssuer ?? null,
    };
  }
}
