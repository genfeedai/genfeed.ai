import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { GenerateLaunchCopyDto } from '@api/collections/launch-copy/dto/generate-launch-copy.dto';
import { LaunchCopyGeneratorService } from '@api/collections/launch-copy/services/launch-copy-generator.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import {
  returnBadRequest,
  returnInternalServerError,
} from '@api/helpers/utils/response/response.util';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Body, Controller, Post } from '@nestjs/common';

@AutoSwagger()
@Controller('launch-copy')
export class LaunchCopyController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly launchCopyGeneratorService: LaunchCopyGeneratorService,
    private readonly brandsService: BrandsService,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Generate channel-conform launch copy (Show HN title/comment, or Product
   * Hunt taglines + maker comment). Generation only — never posts anywhere.
   * POST /launch-copy/generate
   */
  @Post('generate')
  @RateLimit({ limit: 30, scope: 'organization', windowMs: 60000 })
  async generate(
    @CurrentUser() user: User,
    @Body() dto: GenerateLaunchCopyDto,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const publicMetadata = getPublicMetadata(user);

    this.loggerService.log(url, { brandId: dto.brandId, channel: dto.channel });

    const brand = await this.brandsService.findOne({
      _id: dto.brandId,
      isDeleted: false,
      organization: publicMetadata.organization,
    });

    if (!brand) {
      return returnBadRequest({
        detail: 'You do not have access to this brand',
        title: 'Invalid payload',
      });
    }

    try {
      const result = await this.launchCopyGeneratorService.generate(
        publicMetadata.organization,
        dto,
      );

      return { data: result, success: true };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      return returnInternalServerError('Failed to generate launch copy');
    }
  }
}
