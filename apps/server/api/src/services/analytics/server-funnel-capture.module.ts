import { Module } from '@nestjs/common';

import { ServerFunnelCaptureService } from './server-funnel-capture.service';

@Module({
  exports: [ServerFunnelCaptureService],
  providers: [ServerFunnelCaptureService],
})
export class ServerFunnelCaptureModule {}
