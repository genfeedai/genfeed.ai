/**
 * Which sampling parameters a model accepts.
 *
 * Callers pass a `temperature` for every round, but several model families
 * reject it. Through OpenRouter that is worse than an error: a request that
 * carries tools or a schema also sets `require_parameters`, so a model that
 * does not list `temperature` leaves no provider to route to and the round
 * fails with "no endpoints". The check lives here once so each transport
 * asks the same question instead of keeping its own list.
 */

/** Native OpenAI ids (no `openai/` prefix) that think and reject sampling knobs. */
const OPENAI_REASONING_MODEL_PATTERN = /^(?:o3|o4|gpt-5\.6|gpt-6)/;

/** The `o3`/`o4` models reject `max_tokens` as well and take no output cap. */
const OPENAI_NO_OUTPUT_CAP_PATTERN = /^(?:o3|o4)/;

const OPENROUTER_FIXED_SAMPLING_PATTERN =
  /^(?:anthropic\/|openai\/(?:o3|o4|gpt-5\.6|gpt-6))/;

/**
 * True when OpenRouter lists `temperature` for the model. Claude and the
 * reasoning-era OpenAI models do not, so the parameter must be left out.
 */
export function modelAcceptsTemperature(model: string): boolean {
  return !OPENROUTER_FIXED_SAMPLING_PATTERN.test(model);
}

export interface OpenAiSamplingInput {
  max_tokens?: number;
  temperature?: number;
}

/**
 * Sampling and output-cap fields for a native OpenAI request. `model` is the
 * id with its provider prefix already removed.
 */
export function buildOpenAiSamplingParams(
  model: string,
  input: OpenAiSamplingInput,
): Record<string, number> {
  if (OPENAI_NO_OUTPUT_CAP_PATTERN.test(model)) {
    return {};
  }

  if (OPENAI_REASONING_MODEL_PATTERN.test(model)) {
    return input.max_tokens === undefined
      ? {}
      : { max_completion_tokens: input.max_tokens };
  }

  return {
    ...(input.temperature === undefined
      ? {}
      : { temperature: input.temperature }),
    ...(input.max_tokens === undefined ? {} : { max_tokens: input.max_tokens }),
  };
}
