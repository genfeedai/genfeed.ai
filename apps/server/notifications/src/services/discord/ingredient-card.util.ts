import { IngredientCategory } from '@genfeedai/contracts';
import type { IIngredientNotificationData } from '@genfeedai/contracts/interfaces';
import { ButtonBuilder, ButtonStyle } from 'discord.js';

export function getIngredientEmbedColor(category: IngredientCategory): number {
  const colorMap: Partial<Record<IngredientCategory, number>> = {
    [IngredientCategory.IMAGE]: 0x00ff00,
    [IngredientCategory.VIDEO]: 0x0099ff,
    [IngredientCategory.AUDIO]: 0xff00ff,
  };
  return colorMap[category] ?? 0xff00ff;
}

export function buildIngredientFields(
  ingredient: IIngredientNotificationData,
): Array<{ name: string; value: string; inline: boolean }> {
  const fields: Array<{ name: string; value: string; inline: boolean }> = [];

  if (ingredient.prompt?.original) {
    const escapedPrompt = ingredient.prompt.original.replace(/`/g, "'");
    const truncatedPrompt =
      escapedPrompt.length > 1020
        ? `${escapedPrompt.substring(0, 1020)}...`
        : escapedPrompt;

    fields.push({ inline: false, name: 'Prompt', value: truncatedPrompt });
  }

  if (ingredient.metadata?.model) {
    fields.push({
      inline: true,
      name: 'Model',
      value: ingredient.metadata.model,
    });
  }

  if (ingredient.metadata?.externalProvider) {
    fields.push({
      inline: true,
      name: 'Provider',
      value: ingredient.metadata.externalProvider,
    });
  }

  if (ingredient.brand?.label) {
    fields.push({
      inline: true,
      name: 'Brand',
      value: ingredient.brand.label,
    });
  }

  if (ingredient.metadata?.width && ingredient.metadata?.height) {
    fields.push({
      inline: true,
      name: 'Dimensions',
      value: `${ingredient.metadata.width}x${ingredient.metadata.height}`,
    });
  }

  if (ingredient.metadata?.duration) {
    fields.push({
      inline: true,
      name: 'Duration',
      value: `${ingredient.metadata.duration}s`,
    });
  }

  return fields;
}

export function buildIngredientButtons(
  managerUrl: string | null,
  storyboardUrl: string | null = null,
): ButtonBuilder[] {
  const buttons: ButtonBuilder[] = [];

  if (storyboardUrl) {
    buttons.push(
      new ButtonBuilder()
        .setLabel('Open Storyboard')
        .setStyle(ButtonStyle.Link)
        .setURL(storyboardUrl),
    );
  }

  if (managerUrl) {
    buttons.push(
      new ButtonBuilder()
        .setLabel('Open in Manager')
        .setStyle(ButtonStyle.Link)
        .setURL(managerUrl),
    );
  }

  return buttons;
}
