import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ClaimPublicYoutubeClipDto } from '@api/collections/clip-projects/dto/claim-public-youtube-clip.dto';
import { PublicYoutubeClipClaimService } from '@api/collections/clip-projects/services/public-youtube-clip-claim.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import type { JsonApiSingleResponse } from '@genfeedai/contracts/interfaces';
import { ClipProjectSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@ApiTags('clip-projects')
@ApiBearerAuth()
@Controller('clip-projects/public-tool')
@UseGuards(RolesGuard)
export class ClipProjectPublicToolController {
  constructor(private readonly claimService: PublicYoutubeClipClaimService) {}

  @Post('claim')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @ApiOperation({
    description:
      'Atomically attach an expiring public YouTube clip session to the authenticated tenant.',
    summary: 'Claim public YouTube clip project',
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async claim(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() dto: ClaimPublicYoutubeClipDto,
  ): Promise<JsonApiSingleResponse> {
    const project = await this.claimService.claim({
      brandId: dto.brandId,
      previewToken: dto.previewToken,
      user,
    });
    return serializeSingle(request, ClipProjectSerializer, project);
  }
}
