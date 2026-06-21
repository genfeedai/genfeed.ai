import { MoodBoardsController } from '@api/collections/mood-boards/controllers/mood-boards.controller';
import { MoodBoardsService } from '@api/collections/mood-boards/services/mood-boards.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [MoodBoardsController],
  exports: [MoodBoardsService],
  imports: [],
  providers: [MoodBoardsService],
})
export class MoodBoardsModule {}
