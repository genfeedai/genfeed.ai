import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { ContentHarnessService } from '@api/services/harness/harness.service';
import { RateLimit } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import type { IHarnessActivationReport } from '@genfeedai/contracts/interfaces';
import { HarnessActivationReportSerializer } from '@genfeedai/serializers';
import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

/**
 * Read-only proof of which content harness packs this API process runs with,
 * so an operator can check a deployment without reading its logs.
 */
@ApiTags('Admin / Content Harness')
@Controller('admin/harness')
@UseGuards(IpWhitelistGuard, SuperAdminGuard)
export class HarnessActivationController {
  constructor(private readonly harness: ContentHarnessService) {}

  @Get('activation')
  @RateLimit({ limit: 30, scope: 'user', windowMs: 60_000 })
  @ApiOperation({
    summary:
      'Built-in and external content harness packs loaded by this API process, with versions',
  })
  async getActivation(@Req() request: Request) {
    const [activation, packs] = await Promise.all([
      this.harness.getActivationReport(),
      this.harness.listLoadedPackVersions(),
    ]);
    const report: IHarnessActivationReport = {
      builtInPackIds: activation.builtInPackIds,
      external: activation.external,
      generatedAt: new Date().toISOString(),
      packs,
    };
    return serializeSingle(request, HarnessActivationReportSerializer, report);
  }
}
