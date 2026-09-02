import {
  SERVER_TOKENS,
  type ServerCustomerInstanceResolver,
  type ServerPrisma,
} from '@api/server.dependencies';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { Inject, Injectable } from '@nestjs/common';

type FleetRole = 'images' | 'voices' | 'videos';

type CustomerInstanceRow = {
  config?: unknown;
};

@Injectable()
export class CustomerInstanceResolverService
  implements ServerCustomerInstanceResolver
{
  constructor(
    @Inject(SERVER_TOKENS.prisma)
    private readonly prisma: Pick<ServerPrisma, 'customerInstance'>,
  ) {}

  async findRunningForOrg(
    orgId: string,
    role: FleetRole,
  ): Promise<{ apiUrl?: string | null } | null> {
    const instance = await this.prisma.customerInstance.findFirst({
      orderBy: { createdAt: 'desc' },
      where: scopedWhere(orgId, {
        AND: [
          { config: { equals: 'dedicated', path: ['tier'] } },
          {
            OR: [
              { config: { equals: role, path: ['role'] } },
              { config: { equals: 'full', path: ['role'] } },
            ],
          },
        ],
        status: 'running',
      }),
    });

    const match = instance ? this.readInstance(instance) : null;
    return match ? { apiUrl: match.apiUrl } : null;
  }

  private readInstance(instance: CustomerInstanceRow): {
    apiUrl?: string | null;
    role?: string;
    tier?: string;
  } {
    const config =
      instance.config !== null &&
      typeof instance.config === 'object' &&
      !Array.isArray(instance.config)
        ? (instance.config as Record<string, unknown>)
        : {};

    return {
      apiUrl: typeof config.apiUrl === 'string' ? config.apiUrl : null,
      role: typeof config.role === 'string' ? config.role : undefined,
      tier: typeof config.tier === 'string' ? config.tier : undefined,
    };
  }
}
