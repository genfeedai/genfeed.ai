/**
 * Deterministic stand-in for the dispatcher. Generation echoes the brief in
 * a model-specific voice; judging derives a stable pseudo-quality from each
 * text's hash, so a battle gives the same answer in both orderings and a
 * re-run gives byte-identical scores. It measures the harness, never a model.
 */

import { createHash } from 'node:crypto';
import type {
  EvalDispatcher,
  EvalMessage,
  EvalStructuredRequest,
  EvalStructuredResponse,
  StubDispatcherOptions,
} from '../contracts';
import { canonicalJson } from '../provenance';
import { estimateTokens } from '../spend';

export const STUB_PROVIDER = 'stub';
/** $1 per million tokens: small, non-zero, so spend is visibly metered. */
export const STUB_DEFAULT_USD_PER_TOKEN = 0.000_001;

/** Stable 0–1 value for a string. */
export function stubQuality(text: string): number {
  const digest = createHash('sha256').update(text.trim()).digest();
  return digest.readUInt32BE(0) / 0x1_0000_0000;
}

function textOf(message: EvalMessage | undefined): string {
  if (!message) {
    return '';
  }
  if (typeof message.content === 'string') {
    return message.content;
  }

  return message.content
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('\n');
}

function between(text: string, start: string, end: string): string | null {
  const from = text.indexOf(start);
  if (from === -1) {
    return null;
  }
  const rest = text.slice(from + start.length);
  const to = rest.indexOf(end);
  return (to === -1 ? rest : rest.slice(0, to)).trim();
}

function stubGeneration(model: string, messages: EvalMessage[]): unknown {
  const prompt = textOf(messages.find((message) => message.role === 'user'));
  const hasBrief = messages.some((message) => message.role === 'system');
  const voice = stubQuality(model) > 0.5 ? 'Bold take:' : 'Quick note:';
  const closer = hasBrief ? ' Follow us for more.' : '';

  return { text: `${voice} ${prompt}${closer}` };
}

function stubJudgement(messages: EvalMessage[]): unknown {
  const prompt = textOf(messages[messages.length - 1]);
  const choiceList = /exactly one of: (.+)\.$/m.exec(prompt)?.[1];
  const choices = choiceList?.split(', ') ?? [];
  if (choices.length === 0) {
    throw new Error('Stub judge could not find the choice list');
  }

  const first = between(prompt, '[Response 1]', '[Instruction 2]');
  const second = between(prompt, '[Response 2]', 'Is the first response');
  if (first !== null && second !== null) {
    const isFirstBetter = stubQuality(first) >= stubQuality(second);
    return {
      choice: isFirstBetter ? 'Yes' : 'No',
      reasons: 'Stub battle: compared the two responses by hash quality.',
    };
  }

  const content = between(prompt, '[Content]:', '***') ?? prompt;
  const index = Math.min(
    choices.length - 1,
    Math.floor(stubQuality(content) * choices.length),
  );
  return {
    choice: choices[index],
    reasons: 'Stub rubric: mapped the content hash onto the rubric scale.',
  };
}

export function createStubDispatcher(
  options: StubDispatcherOptions = {},
): EvalDispatcher {
  const usdPerToken = options.usdPerToken ?? STUB_DEFAULT_USD_PER_TOKEN;
  const failingModels = new Set(options.failingModels ?? []);

  return {
    async close() {},
    async completeStructured<TResult>(
      request: EvalStructuredRequest<TResult>,
    ): Promise<EvalStructuredResponse<TResult>> {
      if (failingModels.has(request.model)) {
        throw new Error(`Stub failure for ${request.model}`);
      }

      const raw =
        request.role === 'generation'
          ? stubGeneration(request.model, request.messages)
          : stubJudgement(request.messages);
      // Same contract as the live helper: the answer must match the schema.
      const value = request.schema.parse(raw);
      const promptTokens = estimateTokens(canonicalJson(request.messages));
      const completionTokens = estimateTokens(canonicalJson(value));

      return {
        latencyMs: completionTokens,
        modelVersion: `${request.model}@stub`,
        provider: STUB_PROVIDER,
        usage: {
          completionTokens,
          costUsd: (promptTokens + completionTokens) * usdPerToken,
          promptTokens,
        },
        value,
      };
    },
    kind: 'stub',
  };
}
