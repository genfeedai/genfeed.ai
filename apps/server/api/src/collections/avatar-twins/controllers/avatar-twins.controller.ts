import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AvatarTwinConsentDto } from '@api/collections/avatar-twins/dto/avatar-twin-consent.dto';
import { StartAvatarTwinDto } from '@api/collections/avatar-twins/dto/start-avatar-twin.dto';
import {
  type AvatarTwinActor,
  AvatarTwinsService,
} from '@api/collections/avatar-twins/services/avatar-twins.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import type { IAvatarTwinConsentLink } from '@genfeedai/contracts/interfaces';
import { AvatarTwinSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

/** Digital twins the signed-in person records of themselves (#9681). */
@AutoSwagger()
@ApiTags('Avatar twins')
@Controller('avatar-twins')
export class AvatarTwinsController {
  constructor(private readonly avatarTwinsService: AvatarTwinsService) {}

  @Get()
  @RateLimit({ limit: 60, scope: 'user', windowMs: 60_000 })
  async list(@Req() request: Request, @CurrentUser() user: User) {
    const docs = await this.avatarTwinsService.list(actor(user));
    return serializeCollection(request, AvatarTwinSerializer, { docs });
  }

  @Post()
  @RateLimit({ limit: 5, scope: 'user', windowMs: 60_000 })
  async start(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() body: StartAvatarTwinDto,
  ) {
    const twin = await this.avatarTwinsService.start(actor(user), body);
    return serializeSingle(request, AvatarTwinSerializer, twin);
  }

  /** Reads training and consent at the provider, then returns the twin. */
  @Get(':id')
  @RateLimit({ limit: 120, scope: 'user', windowMs: 60_000 })
  async get(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const twin = await this.avatarTwinsService.refresh(actor(user), id);
    return serializeSingle(request, AvatarTwinSerializer, twin);
  }

  @Post(':id/consent-link')
  @RateLimit({ limit: 10, scope: 'user', windowMs: 60_000 })
  async consentLink(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: AvatarTwinConsentDto,
  ): Promise<{ data: IAvatarTwinConsentLink }> {
    const link = await this.avatarTwinsService.requestConsentLink(
      actor(user),
      id,
      body.returnPath,
    );
    return {
      data: {
        consentUrl: link.consentUrl,
        expiresAt: link.expiresAt.toISOString(),
      },
    };
  }

  @Delete(':id')
  @RateLimit({ limit: 10, scope: 'user', windowMs: 60_000 })
  async remove(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    const twin = await this.avatarTwinsService.remove(actor(user), id);
    return serializeSingle(request, AvatarTwinSerializer, twin);
  }
}

function actor(user: User): AvatarTwinActor {
  return { organizationId: user.organizationId, userId: user.userId };
}
