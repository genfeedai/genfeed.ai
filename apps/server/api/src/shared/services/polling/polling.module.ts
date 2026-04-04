import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { PollingService } from '@api/shared/services/polling/polling.service';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  exports: [PollingService],
  imports: [forwardRef(() => IngredientsModule)],
  providers: [PollingService],
})
export class PollingModule {}
