import { CreateCustomerDto } from '@api/collections/customers/dto/create-customer.dto';
import { UpdateCustomerDto } from '@api/collections/customers/dto/update-customer.dto';
import {
  Customer,
  type CustomerDocument,
} from '@api/collections/customers/schemas/customer.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Injectable()
export class CustomersService extends BaseService<
  CustomerDocument,
  CreateCustomerDto,
  UpdateCustomerDto
> {
  constructor(
    @InjectModel(Customer.name, DB_CONNECTIONS.AUTH)
    protected readonly model: AggregatePaginateModel<CustomerDocument>,
    public readonly logger: LoggerService,
  ) {
    super(model, logger);
  }

  findByOrganizationId(organizationId: string): Promise<Customer | null> {
    return this.model
      .findOne({
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      })
      .exec();
  }

  findByStripeCustomerId(stripeCustomerId: string): Promise<Customer | null> {
    return this.model
      .findOne({
        isDeleted: false,
        stripeCustomerId,
      })
      .exec();
  }
}
