import { Module } from '@nestjs/common';
import { NodePtyAdapter } from './pty/node-pty.adapter';
import { PTY_ADAPTER } from './pty/pty-adapter.interface';
import { TerminalGateway } from './terminal.gateway';
import { TerminalService } from './terminal.service';

@Module({
  providers: [
    TerminalGateway,
    TerminalService,
    { provide: PTY_ADAPTER, useClass: NodePtyAdapter },
  ],
})
export class TerminalModule {}
