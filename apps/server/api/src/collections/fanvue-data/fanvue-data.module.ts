import { FanvueDataController } from '@api/collections/fanvue-data/controllers/fanvue-data.controller';
import { FanvueDataService } from '@api/collections/fanvue-data/services/fanvue-data.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [FanvueDataController],
  exports: [FanvueDataService],
  imports: [],
  providers: [FanvueDataService],
})
export class FanvueDataModule {}
