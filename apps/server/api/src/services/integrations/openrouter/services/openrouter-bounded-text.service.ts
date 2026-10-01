import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import {
  type FrozenTextMessage,
  frozenTextMessagesSchema,
  openrouterTextRequestHash,
  type PreparedOpenRouterTextLine,
  validatePreparedOpenRouterTextLine,
} from '@api/helpers/utils/credits/openrouter-text-quote.util';
import type { ResolvedByokCredential } from '@api/services/byok/byok-credential-identity.interface';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import {
  buildOpenRouterPreparedTextParams,
  type ObservedOpenRouterTextResult,
  observePreparedOpenRouterText,
} from '@api/services/integrations/openrouter/services/openrouter-bounded-text.util';
import { Injectable } from '@nestjs/common';

export {
  type ObservedOpenRouterTextResult,
  type OpenRouterTextResponseEvidence,
  openrouterTextResponseEvidenceSchema,
} from '@api/services/integrations/openrouter/services/openrouter-bounded-text.util';

/** Transport adapter only. The caller must persist its funded submission intent before invoking it. */
@Injectable()
export class OpenRouterBoundedTextService {
  constructor(private readonly transport: OpenRouterService) {}

  async dispatchPreparedText(input: {
    prepared: PreparedOpenRouterTextLine;
    messages: readonly FrozenTextMessage[];
    credential?: ResolvedByokCredential;
  }): Promise<ObservedOpenRouterTextResult> {
    const prepared = validatePreparedOpenRouterTextLine(input.prepared);
    const messages = frozenTextMessagesSchema.parse(input.messages);
    if (
      openrouterTextRequestHash(
        input.messages,
        prepared.maximumOutputTokens,
      ) !== prepared.requestHash
    )
      throw new BusinessLogicException('Frozen text request changed');
    if (
      prepared.kind === 'openrouter-text-byok-quote'
        ? !input.credential ||
          input.credential.credentialId !== prepared.credentialId ||
          !input.credential.apiKey
        : input.credential !== undefined
    )
      throw new BusinessLogicException('Frozen text credential route changed');
    const { response: rawResponse, generationMetadata } =
      await this.transport.chatCompletionWithEvidence(
        buildOpenRouterPreparedTextParams(prepared, messages),
        input.credential?.apiKey,
      );
    return observePreparedOpenRouterText(
      prepared,
      rawResponse,
      generationMetadata,
    );
  }
}
