import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import { BaseReplicateBuilder } from '@api/services/prompt-builder/builders/replicate/base-replicate.builder';
import type { PromptBuilderParams } from '@api/services/prompt-builder/interfaces/prompt-builder-params.interface';
import type {
  Claude45SonnetInput,
  DeepSeekR1Input,
  Gemini3ProInput,
  Gemini25FlashInput,
  GPT52Input,
  GPTImage15Input,
  Llama31405BInput,
  ReplicateTextInput,
} from '@api/services/prompt-builder/interfaces/replicate-input.interface';
import { MODEL_KEYS } from '@genfeedai/constants';
import {
  calculateAspectRatio,
  getDefaultAspectRatio,
} from '@genfeedai/helpers';
import { Injectable } from '@nestjs/common';

/**
 * Replicate text/LLM model prompt builder.
 * Handles: DeepSeek, GPT, Gemini, and Llama models.
 */
@Injectable()
export class ReplicateTextBuilder extends BaseReplicateBuilder {
  getSupportedModels(): string[] {
    return [
      DEFAULT_TEXT_MODEL,
      MODEL_KEYS.REPLICATE_DEEPSEEK_AI_DEEPSEEK_R1,
      MODEL_KEYS.REPLICATE_OPENAI_GPT_5_2,
      MODEL_KEYS.REPLICATE_OPENAI_GPT_IMAGE_1_5,
      MODEL_KEYS.REPLICATE_GOOGLE_GEMINI_2_5_FLASH,
      MODEL_KEYS.REPLICATE_GOOGLE_GEMINI_3_PRO,
      MODEL_KEYS.REPLICATE_META_LLAMA_3_1_405B_INSTRUCT,
    ];
  }

  buildPrompt(
    model: string,
    params: PromptBuilderParams,
    promptText: string,
  ): ReplicateTextInput {
    switch (model) {
      case DEFAULT_TEXT_MODEL:
        return this.buildClaude45SonnetPrompt(params, promptText);

      case MODEL_KEYS.REPLICATE_DEEPSEEK_AI_DEEPSEEK_R1:
        return this.buildDeepSeekR1Prompt(params, promptText);

      case MODEL_KEYS.REPLICATE_OPENAI_GPT_5_2:
        return this.buildGPT52Prompt(params, promptText);

      case MODEL_KEYS.REPLICATE_OPENAI_GPT_IMAGE_1_5:
        return this.buildGPTImage15Prompt(params, promptText);

      case MODEL_KEYS.REPLICATE_GOOGLE_GEMINI_2_5_FLASH:
        return this.buildGemini25FlashPrompt(params, promptText);

      case MODEL_KEYS.REPLICATE_GOOGLE_GEMINI_3_PRO:
        return this.buildGemini3ProPrompt(params, promptText);

      case MODEL_KEYS.REPLICATE_META_LLAMA_3_1_405B_INSTRUCT:
        return this.buildLlama31405BPrompt(params, promptText);

      default:
        throw new Error(`Unsupported text model: ${model}`);
    }
  }

  private buildClaude45SonnetPrompt(
    params: PromptBuilderParams,
    promptText: string,
  ): Claude45SonnetInput {
    const input: Claude45SonnetInput = {
      max_tokens: params.maxTokens ?? 4096,
      prompt: promptText,
      temperature: params.temperature ?? 0.7,
    };

    if (params.systemPrompt) {
      input.system_prompt = params.systemPrompt;
    }

    return input;
  }

  private buildDeepSeekR1Prompt(
    params: PromptBuilderParams,
    promptText: string,
  ): DeepSeekR1Input {
    return {
      frequency_penalty: params.frequencyPenalty ?? 0,
      max_tokens: params.maxTokens ?? 2048,
      presence_penalty: params.presencePenalty ?? 0,
      prompt: promptText,
      temperature: params.temperature ?? 0.1,
      top_p: params.topP ?? 1,
    };
  }

  private buildGPT52Prompt(
    params: PromptBuilderParams,
    promptText: string,
  ): GPT52Input {
    const input: GPT52Input = {
      max_completion_tokens: params.maxTokens ?? 8192,
      prompt: promptText,
    };

    if (params.systemPrompt) {
      input.system_prompt = params.systemPrompt;
    }

    if (params.references && params.references.length > 0) {
      input.image_input = params.references.slice(0, 10);
    }

    return input;
  }

  private buildGPTImage15Prompt(
    params: PromptBuilderParams,
    promptText: string,
  ): GPTImage15Input {
    const calculatedAspectRatio = calculateAspectRatio(
      params.width,
      params.height,
    );
    const aspectRatio =
      calculatedAspectRatio ||
      getDefaultAspectRatio(MODEL_KEYS.REPLICATE_OPENAI_GPT_IMAGE_1_5);

    const input: GPTImage15Input = {
      aspect_ratio: aspectRatio,
      prompt: promptText,
    };

    if (params.outputFormat) {
      input.output_format = params.outputFormat;
    }

    if (params.references && params.references.length > 0) {
      input.input_images = params.references.slice(0, 10);
    }

    if (params.outputs && params.outputs > 1) {
      input.number_of_images = Math.min(params.outputs, 10);
    }

    return input;
  }

  private buildGemini25FlashPrompt(
    params: PromptBuilderParams,
    promptText: string,
  ): Gemini25FlashInput {
    const input: Gemini25FlashInput = {
      max_output_tokens: params.maxTokens ?? 8192,
      prompt: promptText,
      temperature: params.temperature ?? 1,
      top_p: params.topP ?? 0.95,
    };

    if (params.systemPrompt) {
      input.system_instruction = params.systemPrompt;
    }

    if (params.references && params.references.length > 0) {
      input.images = params.references.slice(0, 10);
    }

    return input;
  }

  private buildGemini3ProPrompt(
    params: PromptBuilderParams,
    promptText: string,
  ): Gemini3ProInput {
    const input: Gemini3ProInput = {
      max_output_tokens: params.maxTokens ?? 65535,
      prompt: promptText,
      temperature: params.temperature ?? 1,
      top_p: params.topP ?? 0.95,
    };

    if (params.systemPrompt) {
      input.system_instruction = params.systemPrompt;
    }

    if (params.thinkingLevel) {
      input.thinking_level = params.thinkingLevel;
    }

    if (params.references && params.references.length > 0) {
      input.images = params.references.slice(0, 10);
    }

    return input;
  }

  private buildLlama31405BPrompt(
    params: PromptBuilderParams,
    promptText: string,
  ): Llama31405BInput {
    const input: Llama31405BInput = {
      frequency_penalty: params.frequencyPenalty ?? 0,
      max_tokens: params.maxTokens ?? 512,
      presence_penalty: params.presencePenalty ?? 0,
      prompt: promptText,
      temperature: params.temperature ?? 0.6,
      top_k: params.topK ?? 50,
      top_p: params.topP ?? 0.9,
    };

    if (params.systemPrompt) {
      input.system_prompt = params.systemPrompt;
    }

    return input;
  }
}
