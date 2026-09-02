import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { ThreadsCallbackService } from '@api/services/integrations/threads/services/threads-callback.service';
import { Public } from '@libs/decorators/public.decorator';
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';

@AutoSwagger()
@Public()
@Controller('services/threads')
export class ThreadsCallbackController {
  constructor(
    private readonly threadsCallbackService: ThreadsCallbackService,
  ) {}

  @HttpCode(200)
  @Post('deauthorize')
  async deauthorize(
    @Body('signed_request') signedRequest: unknown,
  ): Promise<{ success: true }> {
    await this.threadsCallbackService.handleDeauthorization(signedRequest);
    return { success: true };
  }

  @HttpCode(200)
  @Post('data-deletion')
  dataDeletion(@Body('signed_request') signedRequest: unknown) {
    return this.threadsCallbackService.handleDataDeletion(signedRequest);
  }

  @Get('data-deletion/status/:receipt')
  @Header('Cache-Control', 'private, no-store')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Header('X-Content-Type-Options', 'nosniff')
  dataDeletionStatus(@Param('receipt') receipt: string): string {
    return this.threadsCallbackService.getDataDeletionStatus(receipt);
  }
}
