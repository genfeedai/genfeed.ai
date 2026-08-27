import { CreateRoleDto } from '@api/collections/roles/dto/create-role.dto';
import { UpdateRoleDto } from '@api/collections/roles/dto/update-role.dto';
import type { RoleDocument } from '@api/collections/roles/schemas/role.schema';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';
import { BaseService } from '@server/shared/services/base/base.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class RolesService extends BaseService<
  RoleDocument,
  CreateRoleDto,
  UpdateRoleDto
> {
  public readonly constructorName: string = String(this.constructor.name);

  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'role', logger);
  }
}
