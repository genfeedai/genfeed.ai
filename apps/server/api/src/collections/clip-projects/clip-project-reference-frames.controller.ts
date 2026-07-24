import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import { SelectClipReferenceFrameDto } from '@api/collections/clip-projects/dto/select-clip-reference-frame.dto';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import type { JsonApiSingleResponse } from '@genfeedai/interfaces';
import { ClipProjectSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@ApiTags('clip-projects')
@ApiBearerAuth()
@Controller('clip-projects')
@UseGuards(RolesGuard)
export class ClipProjectReferenceFramesController {
  constructor(
    readonly _loggerService: LoggerService,
    private readonly clipProjectsService: ClipProjectsService,
  ) {}

  @Put(':projectId/reference-frame')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    description:
      'Select an available source-video reference-frame candidate for this clip project.',
    summary: 'Select a clip reference frame',
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async selectReferenceFrame(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Body() dto: SelectClipReferenceFrameDto,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);
    const data = await this.clipProjectsService.selectReferenceFrame(
      projectId,
      publicMetadata.organization,
      dto.candidateId,
    );

    return serializeSingle(request, ClipProjectSerializer, data);
  }
}
