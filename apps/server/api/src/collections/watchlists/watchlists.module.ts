import { WatchlistsController } from '@api/collections/watchlists/controllers/watchlists.controller';
import { WatchlistsService } from '@api/collections/watchlists/services/watchlists.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [WatchlistsController],
  exports: [WatchlistsService],
  imports: [],
  providers: [WatchlistsService],
})
export class WatchlistsModule {}
