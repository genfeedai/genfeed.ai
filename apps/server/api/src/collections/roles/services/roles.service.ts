import { CreateRoleDto } from '@api/collections/roles/dto/create-role.dto';
import { UpdateRoleDto } from '@api/collections/roles/dto/update-role.dto';
import {
  Role,
  type RoleDocument,
} from '@api/collections/roles/schemas/role.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class RolesService extends BaseService<
  RoleDocument,
  CreateRoleDto,
  UpdateRoleDto
> {
  public readonly constructorName: string = String(this.constructor.name);

  constructor(
    @InjectModel(Role.name, DB_CONNECTIONS.AUTH)
    protected readonly model: AggregatePaginateModel<RoleDocument>,
    public readonly logger: LoggerService,
  ) {
    super(model, logger);
  }
}
