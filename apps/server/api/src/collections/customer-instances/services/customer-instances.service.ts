import { CreateCustomerInstanceDto } from '@api/collections/customer-instances/dto/create-customer-instance.dto';
import { UpdateCustomerInstanceDto } from '@api/collections/customer-instances/dto/update-customer-instance.dto';
import type {
  CustomerInstance,
  CustomerInstanceDocument,
  CustomerInstanceRole,
} from '@api/collections/customer-instances/schemas/customer-instance.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class CustomerInstancesService extends BaseService<
  CustomerInstanceDocument,
  CreateCustomerInstanceDto,
  UpdateCustomerInstanceDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'customerInstance', logger);
  }

  private isInstanceObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  private normalizeCustomerInstance(
    record: Record<string, unknown>,
  ): CustomerInstanceDocument {
    const config = this.isInstanceObject(record.config) ? record.config : {};

    return {
      ...(record as unknown as CustomerInstanceDocument),
      _id:
        typeof record.mongoId === 'string' && record.mongoId.length > 0
          ? record.mongoId
          : String(record.id ?? ''),
      amiId: typeof config.amiId === 'string' ? config.amiId : undefined,
      apiUrl: typeof config.apiUrl === 'string' ? config.apiUrl : undefined,
      instanceId:
        typeof config.instanceId === 'string' ? config.instanceId : undefined,
      instanceType:
        typeof config.instanceType === 'string'
          ? config.instanceType
          : undefined,
      organization:
        typeof record.organizationId === 'string'
          ? record.organizationId
          : null,
      region: typeof config.region === 'string' ? config.region : undefined,
      role:
        typeof config.role === 'string'
          ? (config.role as CustomerInstanceRole)
          : undefined,
      subdomain:
        typeof config.subdomain === 'string' ? config.subdomain : undefined,
      tier:
        typeof config.tier === 'string'
          ? (config.tier as CustomerInstanceDocument['tier'])
          : undefined,
    };
  }

  /**
   * Find a running dedicated instance for an org and fleet role.
   * Returns null if no dedicated instance is configured (caller falls back to shared fleet).
   */
  findRunningForOrg(
    organizationId: string,
    role: CustomerInstanceRole,
  ): Promise<CustomerInstance | null> {
    return this.prisma.customerInstance
      .findMany({
        where: {
          isDeleted: false,
          organizationId,
          status: 'running',
        },
        orderBy: { createdAt: 'desc' },
      })
      .then(
        (instances) =>
          instances
            .map((instance) =>
              this.normalizeCustomerInstance(
                instance as unknown as Record<string, unknown>,
              ),
            )
            .find(
              (instance) =>
                instance.tier === 'dedicated' &&
                (instance.role === role || instance.role === 'full'),
            ) ?? null,
      );
  }

  findAllByOrg(organizationId: string): Promise<CustomerInstance[]> {
    return this.prisma.customerInstance
      .findMany({
        where: { isDeleted: false, organizationId },
        orderBy: { createdAt: 'desc' },
      })
      .then((instances) =>
        instances.map((instance) =>
          this.normalizeCustomerInstance(
            instance as unknown as Record<string, unknown>,
          ),
        ),
      );
  }
}
