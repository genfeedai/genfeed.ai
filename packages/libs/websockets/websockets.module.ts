import { WebSocketGateway } from '@libs/websockets/websockets.gateway';
import { WebSocketService } from '@libs/websockets/websockets.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [WebSocketService, WebSocketGateway],
  providers: [WebSocketService, WebSocketGateway],
})
export class WebSocketModule {}
