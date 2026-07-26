import type { WorkflowSession } from '@genfeedai/integrations';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export function buildDiscordConfirmationMessage(session: WorkflowSession): {
  content: string;
  row: ActionRowBuilder<ButtonBuilder>;
} {
  const lines = [`**Workflow:** ${session.workflowName}\n`];
  for (const input of session.requiredInputs) {
    const value = session.collectedInputs.get(input.nodeId) || '(empty)';
    const displayValue =
      input.inputType === 'image' ? '[Image uploaded]' : value;
    lines.push(`**${input.label}:** ${displayValue}`);
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('confirm:run')
      .setLabel('Run')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('confirm:edit')
      .setLabel('Edit')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('confirm:cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger),
  );

  return {
    content: `**Review your inputs:**\n\n${lines.join('\n')}`,
    row,
  };
}
