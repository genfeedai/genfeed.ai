import { ModelsService } from '@api/collections/models/services/models.service';
import { baseModelKey } from '@api/collections/models/utils/model-key.util';
import {
  type ModelCreditQuoteInput,
  quoteModelCredits,
} from '@api/helpers/utils/credits/model-credit-quote.util';
import { BadRequestException, Injectable } from '@nestjs/common';

/**
 * Quotes a model's price from its database row. Quotes for a generation, the
 * guard's reservation and the settled amount all come from the same function
 * (`quoteModelCredits`), so a service never carries a fallback price of its own.
 */
@Injectable()
export class ModelCreditQuoteService {
  constructor(private readonly modelsService: ModelsService) {}

  async quoteByKey(
    modelKey: string,
    input: ModelCreditQuoteInput = {},
  ): Promise<number> {
    const model = await this.modelsService.findOne({
      key: baseModelKey(modelKey),
    });
    if (!model) {
      throw new BadRequestException(`Unknown model: ${modelKey}`);
    }
    return quoteModelCredits(model, input);
  }
}
