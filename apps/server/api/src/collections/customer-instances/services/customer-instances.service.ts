import { CreateCustomerInstanceDto } from '@api/collections/customer-instances/dto/create-customer-instance.dto';
import { UpdateCustomerInstanceDto } from '@api/collections/customer-instances/dto/update-customer-instance.dto';
import {
  CustomerInstance,
  type CustomerInstanceDocument,
  type CustomerInstanceRole,
} from '@api/collections/customer-instances/schemas/customer-instance.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class CustomerInstancesService extends BaseService<
  CustomerInstanceDocument,
  CreateCustomerInstanceDto,
  UpdateCustomerInstanceDto
> {
  constructor(
    @InjectModel(CustomerInstance.name, DB_CONNECTIONS.CLOUD)
    protected readonly model: AggregatePaginateModel<CustomerInstanceDocument>,
    public readonly logger: LoggerService,
  ) {
    super(model, logger);
  }

  /**
   * Find a running dedicated instance for an org and fleet role.
   * Returns null if no dedicated instance is configured (caller falls back to shared fleet).
   */
  findRunningForOrg(
    organizationId: string,
    role: CustomerInstanceRole,
  ): Promise<CustomerInstance | null> {
    return this.model
      .findOne({
        isDeleted: false,
        organizationId,
        role: { $in: [role, 'full'] },
        status: 'running',
      })
      .exec();
  }

  findAllByOrg(organizationId: string): Promise<CustomerInstance[]> {
    return this.model
      .find({ isDeleted: false, organizationId })
      .sort({ createdAt: -1 })
      .exec();
  }
}
