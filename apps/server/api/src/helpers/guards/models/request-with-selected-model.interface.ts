import type { ModelDocument } from '@api/collections/models/schemas/model.schema';
import type { Request } from 'express';

export type RequestWithSelectedModel<TRequest extends Request = Request> =
  TRequest & {
    selectedModel?: ModelDocument;
  };
