import { OutlierLibraryService } from '@api/collections/outlier-library/services/outlier-library.service';
import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { ApiKeyScope } from '@genfeedai/contracts';
import { OUTLIER_LIBRARY_PLATFORMS } from '@genfeedai/contracts/interfaces';
import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

const removalSchema = z
  .object({
    handle: z.string().trim().min(1).max(200),
    platform: z.enum(OUTLIER_LIBRARY_PLATFORMS),
  })
  .strict();

/**
 * Removal requests for other creators in the outlier library (#11644). A
 * creator, or a platform, asks for a handle to be removed: it leaves the list
 * for every organization and is never read again. Nothing about the request
 * but a hash of the platform and handle is kept.
 */
@Controller('admin/outlier-library/removals')
@UseGuards(IpWhitelistGuard, SuperAdminGuard)
export class AdminOutlierLibraryController {
  constructor(private readonly library: OutlierLibraryService) {}

  @Post()
  @HttpCode(204)
  @RequiredScopes(ApiKeyScope.ADMIN)
  @RateLimit({ limit: 20, scope: 'user', windowMs: 60_000 })
  async remove(@Body() body: unknown): Promise<void> {
    const parsed = removalSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        'A platform (youtube, instagram or tiktok) and a handle are required',
      );
    }
    await this.library.removeCreator(parsed.data);
  }
}
