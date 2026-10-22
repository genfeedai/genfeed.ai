import { MissingProviderKeyException } from '@api/helpers/exceptions/missing-provider-key/missing-provider-key.exception';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import { RouterService } from '@api/services/router/router.service';
import { ModelCategory } from '@genfeedai/contracts';
import { CONTEXT_EMBEDDING_DIMENSION } from '@genfeedai/contracts/constants';
import { Injectable } from '@nestjs/common';
import { isAxiosError } from 'axios';

export class ContextEmbeddingProviderError extends Error {
  constructor(
    readonly safeFailureCode:
      | 'INVALID_VECTOR'
      | 'PROVIDER_AUTH'
      | 'PROVIDER_REJECTED'
      | 'PROVIDER_UNAVAILABLE'
      | 'RATE_LIMITED'
      | 'NETWORK'
      | 'TIMEOUT',
    readonly isRetryable: boolean,
  ) {
    super(safeFailureCode);
    this.name = 'ContextEmbeddingProviderError';
  }
}

@Injectable()
export class ContextEmbeddingProviderService {
  constructor(
    private readonly router: RouterService,
    private readonly openRouter: OpenRouterService,
  ) {}

  selectModel(): Promise<string> {
    return this.router.getDefaultModel(ModelCategory.EMBEDDING);
  }

  async query(text: string, modelIdentifier?: string): Promise<number[]> {
    const model = modelIdentifier ?? (await this.selectModel());
    const response = await this.openRouter.embeddings({ input: text, model });
    return this.validate(response.data[0]?.embedding);
  }

  async stored(text: string, modelIdentifier: string): Promise<number[]> {
    const signal = AbortSignal.timeout(60_000);
    try {
      const response = await this.openRouter.embeddings(
        { input: text, model: modelIdentifier },
        undefined,
        { signal, timeout: 60_000 },
      );
      return this.validate(response.data[0]?.embedding);
    } catch (error: unknown) {
      if (error instanceof ContextEmbeddingProviderError) throw error;
      if (error instanceof MissingProviderKeyException) {
        throw new ContextEmbeddingProviderError('PROVIDER_AUTH', false);
      }
      if (
        signal.aborted ||
        (isAxiosError(error) &&
          (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT'))
      ) {
        throw new ContextEmbeddingProviderError('TIMEOUT', true);
      }
      if (isAxiosError(error)) {
        const status = error.response?.status;
        if (status === undefined)
          throw new ContextEmbeddingProviderError('NETWORK', true);
        if (status === 408)
          throw new ContextEmbeddingProviderError('TIMEOUT', true);
        if (status === 429)
          throw new ContextEmbeddingProviderError('RATE_LIMITED', true);
        if (status >= 500)
          throw new ContextEmbeddingProviderError('PROVIDER_UNAVAILABLE', true);
        if (status === 401 || status === 403)
          throw new ContextEmbeddingProviderError('PROVIDER_AUTH', false);
      }
      throw new ContextEmbeddingProviderError('PROVIDER_REJECTED', false);
    }
  }

  private validate(value: number[] | undefined): number[] {
    if (
      !value ||
      value.length !== CONTEXT_EMBEDDING_DIMENSION ||
      !value.every(Number.isFinite)
    ) {
      throw new ContextEmbeddingProviderError('INVALID_VECTOR', false);
    }
    return value;
  }
}
