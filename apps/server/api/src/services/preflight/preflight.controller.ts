import { PreflightService } from '@api/services/preflight/preflight.service';
import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

@ApiTags('Preflight')
@Controller('preflight')
export class PreflightController {
  constructor(private readonly preflightService: PreflightService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get overall system readiness status' })
  async getStatus() {
    return this.preflightService.checkReadiness();
  }

  @Get(':feature')
  @ApiOperation({ summary: 'Get readiness status for a specific feature' })
  @ApiParam({
    enum: ['studio', 'analytics', 'trends', 'marketplace', 'publish'],
    name: 'feature',
  })
  async getFeatureStatus(
    @Param('feature') feature:
      | 'studio'
      | 'analytics'
      | 'trends'
      | 'marketplace'
      | 'publish',
  ) {
    return this.preflightService.checkReadiness(feature);
  }
}
