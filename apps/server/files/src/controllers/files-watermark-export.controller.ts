import { timingSafeEqual } from 'node:crypto';
import { ConfigService } from '@files/config/config.service';
import { WatermarkExportService } from '@files/services/watermark-export/watermark-export.service';
import type { IWatermarkExportRequest } from '@genfeedai/contracts/interfaces';
import {
  Body,
  Controller,
  Headers,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

@Controller('files')
export class FilesWatermarkExportController {
  constructor(
    private readonly config: ConfigService,
    private readonly watermark: WatermarkExportService,
  ) {}

  @Post('watermark-export')
  async export(
    @Headers('x-api-key') key: string | undefined,
    @Body() request: IWatermarkExportRequest,
  ) {
    const expected = this.config.get('GENFEEDAI_API_KEY');
    if (!expected)
      throw new ServiceUnavailableException(
        'Watermark export service authentication is not configured',
      );
    const supplied = Buffer.from(key ?? '');
    const secret = Buffer.from(expected);
    if (supplied.length !== secret.length || !timingSafeEqual(supplied, secret))
      throw new UnauthorizedException();
    return this.watermark.render(request);
  }
}
