import { ResearchScansController } from '@api/endpoints/research-scans/research-scans.controller';
import { ResearchAccessModule } from '@api/services/research-access/research-access.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [ResearchScansController],
  imports: [ResearchAccessModule],
})
export class ResearchScansModule {}
