import { EmailPerformanceService } from '@api/services/email-performance/email-performance.service';
import { Public } from '@libs/decorators/public.decorator';
import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Public()
@Controller('email-performance')
export class EmailPerformanceController {
  constructor(private readonly performance: EmailPerformanceService) {}

  @Get('click/:token')
  async click(
    @Param('token') token: string,
    @Res() response: Response,
  ): Promise<void> {
    const destination = await this.performance.trackClick(token);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.redirect(302, destination);
  }

  @Post('webhooks/resend')
  @HttpCode(204)
  async webhook(
    @Req() request: Request,
    @Headers('svix-id') id: string,
    @Headers('svix-timestamp') timestamp: string,
    @Headers('svix-signature') signature: string,
  ): Promise<void> {
    if (!Buffer.isBuffer(request.body))
      throw new BadRequestException('Raw webhook body required');
    await this.performance.receiveWebhook(request.body, {
      id,
      timestamp,
      signature,
    });
  }
}
