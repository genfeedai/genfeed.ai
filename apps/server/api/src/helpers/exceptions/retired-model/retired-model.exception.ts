import { BadRequestException } from '@nestjs/common';

const RETIRED_MODEL_CODE = 'model_retired';

/**
 * An explicit choice (workflow step, brand or organization default, schedule,
 * agent run, API or MCP call) names a model that has been retired. A retired
 * model has no successor and is never swapped for another one: the run stops
 * here, before any provider call, so nothing was dispatched or billed, and it
 * stays stopped until the user picks a new model.
 */
export class RetiredModelException extends BadRequestException {
  public readonly modelKey: string;
  public readonly modelLabel: string;

  constructor(modelKey: string, modelLabel?: string | null) {
    const label = modelLabel?.trim() || modelKey;
    const message = `The model ${label} was retired. Pick a new model, then run it again.`;

    super({
      code: RETIRED_MODEL_CODE,
      detail: message,
      message,
      meta: { modelKey, modelLabel: label },
      title: 'Model retired',
    });

    this.name = 'RetiredModelException';
    this.modelKey = modelKey;
    this.modelLabel = label;
  }
}
