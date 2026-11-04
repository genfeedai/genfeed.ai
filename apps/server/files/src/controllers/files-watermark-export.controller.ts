import { WatermarkExportService } from '@files/services/watermark-export/watermark-export.service';
import type { IWatermarkExportRequest } from '@genfeedai/contracts/interfaces';
import { Body, Controller, Post } from '@nestjs/common';

@Controller('files')
export class FilesWatermarkExportController {
  constructor(private readonly watermark: WatermarkExportService) {}

  @Post('watermark-export')
  async export(@Body() request: IWatermarkExportRequest) {
    return this.watermark.render(request);
  }
}
