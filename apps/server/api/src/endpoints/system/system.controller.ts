import { ConfigService } from '@api/config/config.service';
import { LocalhostOnlyGuard } from '@api/endpoints/system/guards/localhost-only.guard';
import { Public } from '@libs/decorators/public.decorator';
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('System')
@Controller('system')
export class SystemController {
  constructor(private readonly configService: ConfigService) {}

  @Public()
  @Get('db-mode')
  @UseGuards(LocalhostOnlyGuard)
  @ApiOperation({
    summary: 'Get the current database mode for local development',
  })
  getDbMode() {
    const mode = this.configService.get('DB_MODE') ?? 'development';

    return { mode };
  }
}
