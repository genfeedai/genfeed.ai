import { BookmarksController } from '@api/collections/bookmarks/controllers/bookmarks.controller';
import { BookmarksService } from '@api/collections/bookmarks/services/bookmarks.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [BookmarksController],
  exports: [BookmarksService],
  imports: [],
  providers: [BookmarksService],
})
export class BookmarksModule {}
