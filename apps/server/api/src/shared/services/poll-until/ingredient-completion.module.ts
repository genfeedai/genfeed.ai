import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { IngredientCompletionService } from '@api/shared/services/poll-until/ingredient-completion.service';
import { PollUntilModule } from '@api/shared/services/poll-until/poll-until.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  exports: [IngredientCompletionService],
  imports: [forwardRef(() => IngredientsModule), PollUntilModule],
  providers: [IngredientCompletionService],
})
export class IngredientCompletionModule {}
