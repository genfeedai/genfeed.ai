import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { PollingService } from '@api/shared/services/polling/polling.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [PollingService],
  imports: [IngredientsModule],
  providers: [PollingService],
})
export class PollingModule {}
