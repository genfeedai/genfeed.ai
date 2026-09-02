import { BrandMemoryController } from '@api/collections/brand-memory/controllers/brand-memory.controller';
import { BrandMemoryService } from '@api/collections/brand-memory/services/brand-memory.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [BrandMemoryController],
  exports: [BrandMemoryService],
  imports: [],
  providers: [BrandMemoryService],
})
export class BrandMemoryModule {}
