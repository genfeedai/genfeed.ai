import type {
  BrandingMode,
  JsonPrompt,
  PromptBuilderParams,
} from '@api/services/prompt-builder/interfaces/prompt-builder-params.interface';

/**
 * Utility to build universal JSON prompt structure
 * This format is used across Replicate, OpenAI, and other providers
 */
export class JsonPromptBuilder {
  private static resolveBrandingMode(
    params: PromptBuilderParams,
  ): BrandingMode {
    if (params.brandingMode) {
      return params.brandingMode;
    }

    return params.isBrandingEnabled ? 'brand' : 'off';
  }

  /**
   * Build a universal JSON prompt from parameters
   * @param params - Prompt builder parameters
   * @returns Structured JSON prompt object
   */
  static build(params: PromptBuilderParams): JsonPrompt {
    const jsonPrompt: JsonPrompt = {
      elements: {},
      text: params.prompt,
    };

    // Add creative elements if provided
    if (params.mood) {
      jsonPrompt.elements.mood = params.mood;
    }

    if (params.style) {
      jsonPrompt.elements.style = params.style;
    }

    if (params.camera) {
      jsonPrompt.elements.camera = params.camera;
    }

    if (params.cameraMovement) {
      jsonPrompt.elements.cameraMovement = params.cameraMovement;
    }

    if (params.lens) {
      jsonPrompt.elements.lens = params.lens;
    }

    if (params.scene) {
      jsonPrompt.elements.scene = params.scene;
    }

    if (params.lighting) {
      jsonPrompt.elements.lighting = params.lighting;
    }

    // Add sounds characteristics to the prompt
    if (params.sounds && params.sounds.length > 0) {
      jsonPrompt.elements.sounds = params.sounds.join(', ');
    }

    // Add speech if provided
    if (params.speech?.trim()) {
      jsonPrompt.elements.speech = params.speech.trim();
    }

    const brandingMode = JsonPromptBuilder.resolveBrandingMode(params);

    if (brandingMode === 'brand' && params.brand) {
      jsonPrompt.elements.brand = {
        label: params.brand.label,
      };

      if (params.brand.description) {
        jsonPrompt.elements.brand.description = params.brand.description;
      }

      if (params.brand.text) {
        jsonPrompt.elements.brand.text = params.brand.text;
      }

      if (params.brand.primaryColor) {
        jsonPrompt.elements.brand.primaryColor = params.brand.primaryColor;
      }

      if (params.brand.secondaryColor) {
        jsonPrompt.elements.brand.secondaryColor = params.brand.secondaryColor;
      }
    }

    // Include Knowledge Base branding metadata if enabled and available
    if (brandingMode === 'brand' && params.branding) {
      jsonPrompt.elements.branding = {};

      if (params.branding.tone) {
        jsonPrompt.elements.branding.tone = params.branding.tone;
      }

      if (params.branding.voice) {
        jsonPrompt.elements.branding.voice = params.branding.voice;
      }

      if (params.branding.audience) {
        jsonPrompt.elements.branding.audience = params.branding.audience;
      }

      if (params.branding.values && params.branding.values.length > 0) {
        jsonPrompt.elements.branding.values = params.branding.values;
      }

      if (params.branding.taglines && params.branding.taglines.length > 0) {
        jsonPrompt.elements.branding.taglines = params.branding.taglines;
      }

      if (params.branding.hashtags && params.branding.hashtags.length > 0) {
        jsonPrompt.elements.branding.hashtags = params.branding.hashtags;
      }
    }

    return jsonPrompt;
  }

  /**
   * Convert JSON prompt to string format
   * @param jsonPrompt - The JSON prompt object
   * @returns Stringified JSON prompt
   */
  static stringify(jsonPrompt: JsonPrompt): string {
    return JSON.stringify(jsonPrompt);
  }

  /**
   * Build and stringify in one call
   * @param params - Prompt builder parameters
   * @returns Stringified JSON prompt
   */
  static buildAndStringify(params: PromptBuilderParams): string {
    const jsonPrompt = JsonPromptBuilder.build(params);
    return JsonPromptBuilder.stringify(jsonPrompt);
  }
}
