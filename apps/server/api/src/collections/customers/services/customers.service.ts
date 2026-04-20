import { CreateCustomerDto } from '@api/collections/customers/dto/create-customer.dto';
import { UpdateCustomerDto } from '@api/collections/customers/dto/update-customer.dto';
import type {
  Customer,
  CustomerDocument,
} from '@api/collections/customers/schemas/customer.schema';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class CustomersService extends BaseService<
  CustomerDocument,
  CreateCustomerDto,
  UpdateCustomerDto
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'customer', logger);
  }

  findByOrganizationId(organizationId: string): Promise<Customer | null> {
    return this.delegate.findFirst({
      where: {
        isDeleted: false,
        organizationId,
      },
    }) as Promise<Customer | null>;
  }

  findByStripeCustomerId(stripeCustomerId: string): Promise<Customer | null> {
    return this.delegate.findFirst({
      where: {
        isDeleted: false,
        stripeCustomerId,
      },
    }) as Promise<Customer | null>;
  }
}
