import {
  type DeferredCreditsRequest,
  isDeferredCreditsRequest,
} from '@api/helpers/utils/credits/generation-credit-cost.util';
import { ByokService } from '@api/services/byok/byok.service';
import {
  resolveTextDispatchByokProvider,
  type TextByokDispatch,
  type TextDispatchByokProvider,
  type TextDispatchKeyResolver,
  textDispatchApiKey,
} from '@api/services/byok/text-dispatch-byok.util';
import { ByokProvider } from '@genfeedai/contracts';
import { ConflictException, Injectable } from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class TextGenerationCreditsService {
  constructor(private readonly byokService: ByokService) {}

  /**
   * The single BYOK decision for a text request (#5380). Call it once the
   * dispatched models are resolved: each model's dispatch provider key is
   * resolved exactly once, and the request bypasses credits only when every
   * model it calls has one — a mixed request never runs some calls on the
   * platform key uncharged. The returned keys are the ones dispatch must use.
   */
  async resolveDispatch(
    organizationId: string,
    models: readonly string[],
  ): Promise<TextByokDispatch | undefined> {
    const providers = [...new Set(models.map(resolveTextDispatchByokProvider))];
    if (providers.length === 0) {
      return undefined;
    }

    const keys: Partial<Record<TextDispatchByokProvider, string>> = {};
    for (const provider of providers) {
      const resolved = await this.byokService.resolveApiKey(
        organizationId,
        provider,
      );
      if (!resolved?.apiKey) {
        return undefined;
      }
      keys[provider] = resolved.apiKey;
    }
    return { keys };
  }

  /**
   * Text equivalent of `ImageGenerationCreditsService.ensureDeferredCredits`
   * for `@DeferCreditsUntilModelResolution()` routes, whose model (the Admin
   * default TEXT model) is unknown when `CreditsGuard` runs. Marks the
   * deferred charge as BYOK usage in the same step that yields the dispatch
   * keys, so the credit decision and the key can never disagree. A request
   * the guard did not defer keeps the guard's decision and gets no keys.
   */
  async ensureDeferredCredits(
    request: Request,
    organizationId: string,
    models: readonly string[],
  ): Promise<TextByokDispatch | undefined> {
    const reqWithCredits = request as unknown as DeferredCreditsRequest;
    if (!isDeferredCreditsRequest(reqWithCredits)) {
      return undefined;
    }

    const dispatch = await this.resolveDispatch(organizationId, models);
    if (dispatch) {
      reqWithCredits.creditsConfig = {
        ...reqWithCredits.creditsConfig,
        isByokBypass: true,
      };
    }
    return dispatch;
  }

  /**
   * The dispatch keys for an `allowByokBypass` route whose provider is fixed
   * on its `@Credits` decorator, where `CreditsGuard` already made the single
   * resolution. A bypass whose key cannot drive text dispatch fails closed.
   */
  guardResolvedDispatch(request: Request): TextByokDispatch | undefined {
    const config = (request as unknown as DeferredCreditsRequest).creditsConfig;
    if (!config?.isByokBypass) {
      return undefined;
    }
    const { byokApiKeyOverride: apiKey, provider } = config;
    if (
      !apiKey ||
      (provider !== ByokProvider.OPENROUTER &&
        provider !== ByokProvider.REPLICATE)
    ) {
      throw new ConflictException(
        'BYOK billing was granted without a usable text provider key.',
      );
    }
    return { keys: { [provider]: apiKey } };
  }

  /**
   * Binds {@link ensureDeferredCredits} to one request for a single-model
   * service that resolves its model after the controller hands off. Call the
   * returned resolver once, with the model about to be dispatched.
   */
  deferredKeyResolver(
    request: Request,
    organizationId: string,
  ): TextDispatchKeyResolver {
    return async (model) =>
      textDispatchApiKey(
        await this.ensureDeferredCredits(request, organizationId, [model]),
        model,
      );
  }
}
