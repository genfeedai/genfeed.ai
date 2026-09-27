import type { BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import type { IPromptBrandContext } from '@api/shared/interfaces/prompt/prompt.interface';

/** Brand fields the prompt builder reads, shared by the prompts controller and transformation service. */
export function toPromptBrandContext(
  brand: BrandDocument | null | undefined,
): IPromptBrandContext | undefined {
  if (!brand) {
    return undefined;
  }

  return {
    backgroundColor: brand.backgroundColor ?? undefined,
    description: brand.description ?? undefined,
    label: brand.label ?? undefined,
    primaryColor: brand.primaryColor ?? undefined,
    secondaryColor: brand.secondaryColor ?? undefined,
    text: brand.text ?? undefined,
  };
}

/** Returns the `prompt` field of a JSON-encoded prompt, or the raw string when it isn't JSON. */
export function extractPromptText(promptString: string): string {
  try {
    const prompt = JSON.parse(promptString) as { prompt?: string };
    return prompt.prompt || promptString;
  } catch {
    return promptString;
  }
}
