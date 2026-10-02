import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { ImportSkillPackageDto } from '@api/collections/skills/dto/import-skill-package.dto';
import { SkillLibraryService } from '@api/collections/skills/services/skill-library.service';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import {
  RateLimit,
  RateLimitPresets,
} from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { SkillSerializer } from '@genfeedai/serializers';
import {
  Body,
  Controller,
  ForbiddenException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

@Controller('skills')
@UseGuards(RolesGuard)
export class SkillPackageImportController {
  constructor(private readonly library: SkillLibraryService) {}

  @Post('import')
  @RateLimit(RateLimitPresets.uploads)
  async importSkillPackage(
    @Req() request: Request,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: ImportSkillPackageDto,
  ) {
    const organizationId = user.organizationId?.toString();
    if (!organizationId || !user.userId) {
      throw new ForbiddenException(
        'Canonical user and organization context are required',
      );
    }
    const actor = { organizationId, userId: user.userId };
    const created = await this.library.importValidatedPackage(actor, body);
    const visible = await this.library.present(actor, [created]);
    const presented = visible[0];
    if (!presented) {
      throw new ForbiddenException(
        'Skill import was created, but details are unavailable. Refresh the skill library.',
      );
    }
    return serializeSingle(request, SkillSerializer, presented);
  }
}
