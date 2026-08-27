import { Inject, Injectable } from '@nestjs/common';
import {
  SERVER_TOKENS,
  type ServerCustomerInstanceResolver,
  type ServerPrisma,
} from '@server/server.dependencies';
import { scopedWhere } from '@server/tenancy/scoped-where';

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
    const instances = await this.prisma.customerInstance.findMany({
      orderBy: { createdAt: 'desc' },
      where: scopedWhere(orgId, { status: 'running' }),
    });

    const match = instances
      .map((instance) => this.readInstance(instance))
      .find(
        (instance) =>
          instance.tier === 'dedicated' &&
          (instance.role === role || instance.role === 'full'),
      );

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
