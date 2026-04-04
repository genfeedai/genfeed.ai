import { MemoryMonitorService } from '@api/helpers/memory/monitor/memory-monitor.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [MemoryMonitorService],
  imports: [],
  providers: [MemoryMonitorService],
})
export class MemoryModule {}
