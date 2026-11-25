import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { InspectCharacterImageDto } from '@api/collections/personas/dto/inspect-character-image.dto';
import { CharacterImageInspectionService } from '@api/collections/personas/services/character-image-inspection.service';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { API_KEY_CONTENT_GENERATION_SCOPES } from '@api/helpers/utils/auth/api-key-route-scope-sets.util';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { CharacterImageInspectionSerializer } from '@genfeedai/serializers';
import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

@Controller('personas/inspect-image')
@UseGuards(RolesGuard)
export class CharacterImageInspectionController {
  constructor(private readonly inspection: CharacterImageInspectionService) {}
  @Post()
  @RequiredScopes(...API_KEY_CONTENT_GENERATION_SCOPES)
  @RateLimit({ limit: 20, scope: 'user', windowMs: 60_000 })
  async inspect(
    @Req() request: RequestWithContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: InspectCharacterImageDto,
  ) {
    if (!user.organizationId || !user.brandId)
      throw new BadRequestException('Organization and brand are required');
    const result = await this.inspection.inspect(
      body.assetId,
      user.organizationId,
      user.brandId,
    );
    return serializeSingle(request, CharacterImageInspectionSerializer, result);
  }
}
