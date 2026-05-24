import { CreateRoleDto } from '@api/collections/roles/dto/create-role.dto';
import { UpdateRoleDto } from '@api/collections/roles/dto/update-role.dto';
import { RoleEntity } from '@api/collections/roles/entities/role.entity';
import { RolesService } from '@api/collections/roles/services/roles.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import type { User } from '@clerk/backend';
import { RoleSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post()
  @RolesDecorator('superadmin')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async create(
    @Req() request: Request,
    @CurrentUser() _user: User,
    @Body() createRoleDto: CreateRoleDto,
  ) {
    try {
      const roleData = new RoleEntity(createRoleDto);

      const data = await this.rolesService.create(
        roleData as unknown as CreateRoleDto,
      );
      return serializeSingle(request, RoleSerializer, data);
    } catch (error: unknown) {
      throw new HttpException(
        {
          error: (error as Error)?.message,
          message: 'Failed to create role',
          success: false,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(@Req() request: Request, @Query() _query: BaseQueryDto) {
    try {
      const data = await this.rolesService.findAll(
        {
          where: {
            isDeleted: false,
          },
        },
        {
          pagination: false,
        },
      );

      return serializeCollection(request, RoleSerializer, data);
    } catch (error: unknown) {
      throw new HttpException(
        {
          error: (error as Error)?.message,
          message: 'Failed to fetch roles',
          success: false,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get(':roleId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(@Req() request: Request, @Param('roleId') roleId: string) {
    try {
      const data = await this.rolesService.findOne({ _id: roleId });
      if (!data) {
        throw new HttpException('Role not found', HttpStatus.NOT_FOUND);
      }
      return serializeSingle(request, RoleSerializer, data);
    } catch (error: unknown) {
      throw new HttpException(
        {
          error: (error as Error)?.message,
          message: 'Failed to fetch role',
          success: false,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Patch(':roleId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async update(
    @Req() request: Request,
    @Param('roleId') roleId: string,
    @Body() updateRoleDto: UpdateRoleDto,
  ) {
    try {
      const data = await this.rolesService.patch(roleId, updateRoleDto);
      return serializeSingle(request, RoleSerializer, data);
    } catch (error: unknown) {
      throw new HttpException(
        {
          error: (error as Error)?.message,
          message: 'Failed to update role',
          success: false,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Delete(':roleId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async remove(@Req() request: Request, @Param('roleId') roleId: string) {
    try {
      const data = await this.rolesService.patch(roleId, {
        isDeleted: true,
      });
      return serializeSingle(request, RoleSerializer, data);
    } catch (error: unknown) {
      throw new HttpException(
        {
          error: (error as Error)?.message,
          message: 'Failed to delete role',
          success: false,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
