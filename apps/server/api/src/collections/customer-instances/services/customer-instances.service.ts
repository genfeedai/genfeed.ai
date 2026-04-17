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

  /**
   * Find a running dedicated instance for an org and fleet role.
   * Returns null if no dedicated instance is configured (caller falls back to shared fleet).
   */
  findRunningForOrg(
    organizationId: string,
    role: CustomerInstanceRole,
  ): Promise<CustomerInstance | null> {
    return this.delegate.findFirst({
      where: {
        isDeleted: false,
        organizationId,
        role: { in: [role, 'full'] },
        status: 'running',
        tier: 'dedicated',
      },
      orderBy: [{ lastStartedAt: 'desc' }, { createdAt: 'desc' }],
    }) as Promise<CustomerInstance | null>;
  }

  findAllByOrg(organizationId: string): Promise<CustomerInstance[]> {
    return this.delegate.findMany({
      where: { isDeleted: false, organizationId },
      orderBy: { createdAt: 'desc' },
    }) as Promise<CustomerInstance[]>;
  }
}
