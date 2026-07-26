import {
  isBotUserAuthorized,
  type OrgIntegration,
  type WorkflowSession,
} from '@genfeedai/integrations';
import {
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Client,
  Events,
  type Message,
} from 'discord.js';

interface DiscordBotHandlers {
  getSession(sessionKey: string): WorkflowSession | undefined;
  handleAttachmentInput(message: Message, sessionKey: string): Promise<void>;
  handleButtonInteraction(
    interaction: ButtonInteraction,
    orgId: string,
  ): Promise<void>;
  handleCancelCommand(interaction: ChatInputCommandInteraction): Promise<void>;
  handleSettingsCommand(
    interaction: ChatInputCommandInteraction,
  ): Promise<void>;
  handleStatusCommand(interaction: ChatInputCommandInteraction): Promise<void>;
  handleTextInput(message: Message, sessionKey: string): Promise<void>;
  handleWorkflowsCommand(
    interaction: ChatInputCommandInteraction,
    orgId: string,
  ): Promise<void>;
  registerSlashCommands(clientId: string, botToken: string): Promise<void>;
  logReady(tag: string): void;
}

/**
 * Register Discord transport handlers while the manager owns workflow state.
 */
export function registerDiscordBotHandlers(
  client: Client,
  integration: OrgIntegration,
  handlers: DiscordBotHandlers,
): void {
  const orgId = integration.orgId;
  const accessConfig = integration.config;

  client.once(Events.ClientReady, async (readyClient) => {
    handlers.logReady(readyClient.user.tag);
    await handlers.registerSlashCommands(
      readyClient.user.id,
      integration.botToken,
    );
  });

  client.on('interactionCreate', async (interaction) => {
    if (!isBotUserAuthorized(accessConfig, interaction.user.id)) {
      if (interaction.isRepliable()) {
        await interaction.reply({
          content: 'You are not authorized to use this bot.',
          ephemeral: true,
        });
      }
      return;
    }

    if (interaction.isChatInputCommand()) {
      switch (interaction.commandName) {
        case 'workflows':
          await handlers.handleWorkflowsCommand(interaction, orgId);
          break;
        case 'status':
          await handlers.handleStatusCommand(interaction);
          break;
        case 'cancel':
          await handlers.handleCancelCommand(interaction);
          break;
        case 'settings':
          await handlers.handleSettingsCommand(interaction);
          break;
      }
    } else if (interaction.isButton()) {
      await handlers.handleButtonInteraction(interaction, orgId);
    }
  });

  client.on('messageCreate', async (message) => {
    if (message.author.bot) {
      return;
    }

    if (!isBotUserAuthorized(accessConfig, message.author.id)) {
      return;
    }

    const sessionKey = `${message.channelId}:${message.author.id}`;
    const session = handlers.getSession(sessionKey);
    if (!session || session.state !== 'collecting') {
      return;
    }

    if (message.attachments.size > 0) {
      await handlers.handleAttachmentInput(message, sessionKey);
    } else if (message.content) {
      await handlers.handleTextInput(message, sessionKey);
    }
  });
}
