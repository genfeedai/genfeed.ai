import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { ArgilService } from '@api/services/integrations/argil/services/argil.service';
import { Controller, Get } from '@nestjs/common';

@AutoSwagger()
@Controller('argil')
export class ArgilController {
  constructor(private readonly argilService: ArgilService) {}

  @Get('avatars')
  async getAvatars(@CurrentUser() user: User) {
    const organizationId = user.organizationId ?? '';
    const avatars = await this.argilService.getAvatars(organizationId);
    return {
      data: {
        attributes: { avatars, count: avatars.length, provider: 'argil' },
        type: 'avatars',
      },
    };
  }

  @Get('voices')
  async getVoices(@CurrentUser() user: User) {
    const organizationId = user.organizationId ?? '';
    const voices = await this.argilService.getVoices(organizationId);
    return {
      data: {
        attributes: { count: voices.length, provider: 'argil', voices },
        type: 'voices',
      },
    };
  }

  @Get('status')
  async getStatus(@CurrentUser() user: User) {
    const organizationId = user.organizationId ?? '';
    await this.argilService.getAvatars(organizationId);
    return {
      data: {
        attributes: { isConnected: true, provider: 'argil' },
        type: 'service-status',
      },
    };
  }
}
