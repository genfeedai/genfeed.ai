import { UsersService } from '@api/collections/users/services/users.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import {
  returnNotFound,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { UserSignupNetworkSerializer } from '@genfeedai/serializers';
import {
  Controller,
  Get,
  Header,
  Param,
  Req,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import type { Request } from 'express';

@Controller('users')
@UseGuards(RolesGuard)
export class UsersSignupNetworkController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':userId/signup-network')
  @Header('Cache-Control', 'private, no-store')
  @SetMetadata('roles', ['superadmin'])
  @ApiExcludeEndpoint()
  async findSignupNetwork(
    @Req() request: Request,
    @Param('userId') userId: string,
  ) {
    const data = await this.usersService.findSignupNetwork(userId);
    return data
      ? serializeSingle(request, UserSignupNetworkSerializer, data)
      : returnNotFound('User', userId);
  }
}
