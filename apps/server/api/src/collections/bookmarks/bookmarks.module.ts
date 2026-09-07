import { BookmarksService } from '@api/collections/bookmarks/services/bookmarks.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [BookmarksService],
  imports: [],
  providers: [BookmarksService],
})
export class BookmarksModule {}
