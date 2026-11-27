import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { ApiKeyScope } from '@genfeedai/contracts';
import type { IRepoSyncReview } from '@genfeedai/contracts/interfaces/admin/repo-sync.interface';
import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SyncSkillsDto } from './dto/sync-skills.dto';
import { AdminSkillSyncService } from './skill-sync.service';

/**
 * Brings the platform skills up to the public skills repository without a
 * deploy. Defaults to a dry run that reports what a live run would write.
 */
@ApiTags('Admin / Sync')
@Controller('admin/sync/skills')
@UseGuards(IpWhitelistGuard, SuperAdminGuard)
export class AdminSkillSyncController {
  constructor(private readonly sync: AdminSkillSyncService) {}

  @Post()
  @RequiredScopes(ApiKeyScope.ADMIN)
  @HttpCode(200)
  @RateLimit({ limit: 5, scope: 'user', windowMs: 60_000 })
  @ApiOperation({
    summary: 'Refresh the platform skills from genfeedai/skills',
  })
  refresh(@Body() dto: SyncSkillsDto): Promise<IRepoSyncReview> {
    return this.sync.syncPlatformSkills(dto);
  }
}
