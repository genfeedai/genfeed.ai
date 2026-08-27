import { CreativePatternsController } from '@api/collections/creative-patterns/controllers/creative-patterns.controller';
import { CreativePatternsService } from '@server/collections/creative-patterns/creative-patterns.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [CreativePatternsController],
  exports: [CreativePatternsService],
  imports: [],
  providers: [CreativePatternsService],
})
export class CreativePatternsModule {}
