import { AuthBootstrapService } from '@api/auth/services/auth-bootstrap.service';
import { Controller, Get, Req } from '@nestjs/common';

@Controller('auth')
export class AuthBootstrapController {
  constructor(private readonly authBootstrapService: AuthBootstrapService) {}

  @Get('bootstrap')
  async bootstrap(
    @Req() req: Parameters<AuthBootstrapService['getBootstrap']>[0],
  ) {
    return await this.authBootstrapService.getBootstrap(req);
  }

  @Get('bootstrap/overview')
  async overviewBootstrap(
    @Req() req: Parameters<AuthBootstrapService['getOverviewBootstrap']>[0],
  ) {
    return await this.authBootstrapService.getOverviewBootstrap(req);
  }
}
