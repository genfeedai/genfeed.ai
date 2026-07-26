import {
  IMAGE_MODELS,
  isBotUserAuthorized,
  type OrgIntegration,
  type UserSettings,
  VIDEO_MODELS,
  type WorkflowSession,
} from '@genfeedai/integrations';
import { type App, type RespondArguments, type types } from '@slack/bolt';

interface SlackReplyArguments {
  blocks?: Array<types.Block | types.KnownBlock>;
  text: string;
}

export type SlackReply = (
  message: string | SlackReplyArguments,
) => Promise<unknown>;
export type SlackRespond = (
  message: string | RespondArguments,
) => Promise<unknown>;

interface SlackBotHandlers {
  deleteSession(userId: string): void;
  getSession(userId: string): WorkflowSession | undefined;
  getUserSettings(userId: string): UserSettings | undefined;
  handleCancelCommand(userId: string, respond: SlackRespond): Promise<void>;
  handleEdit(userId: string, respond: SlackRespond): Promise<void>;
  handleRun(
    userId: string,
    orgId: string,
    respond: SlackRespond,
  ): Promise<void>;
  handleSettingsCommand(userId: string, respond: SlackRespond): Promise<void>;
  handleStatusCommand(userId: string, respond: SlackRespond): Promise<void>;
  handleWorkflowsCommand(
    userId: string,
    orgId: string,
    respond: SlackRespond,
  ): Promise<void>;
  logFileError(error: unknown): void;
  promptNextInput(userId: string, respond: SlackReply): Promise<void>;
  selectWorkflow(
    userId: string,
    orgId: string,
    workflowId: string,
    respond: SlackRespond,
  ): Promise<void>;
  setSession(userId: string, session: WorkflowSession): void;
  setUserSettings(userId: string, settings: UserSettings): void;
}

/**
 * Register Slack transport handlers while the manager owns workflow state and
 * execution. Keeping transport wiring here prevents the manager's lifecycle
 * method from becoming an oversized event-registration monolith.
 */
export function registerSlackBotHandlers(
  app: App,
  integration: OrgIntegration,
  handlers: SlackBotHandlers,
): void {
  const orgId = integration.orgId;
  const accessConfig = integration.config;

  app.use(async ({ next, context }) => {
    const userId = context.userId as string | undefined;
    if (!isBotUserAuthorized(accessConfig, userId)) {
      return;
    }
    await next();
  });

  app.command('/workflows', async ({ command, ack, respond }) => {
    await ack();
    await handlers.handleWorkflowsCommand(command.user_id, orgId, respond);
  });

  app.command('/status', async ({ command, ack, respond }) => {
    await ack();
    await handlers.handleStatusCommand(command.user_id, respond);
  });

  app.command('/cancel', async ({ command, ack, respond }) => {
    await ack();
    await handlers.handleCancelCommand(command.user_id, respond);
  });

  app.command('/settings', async ({ command, ack, respond }) => {
    await ack();
    await handlers.handleSettingsCommand(command.user_id, respond);
  });

  app.action(/^wf:/, async ({ action, ack, respond, body }) => {
    await ack();
    const actionValue = (action as { value?: string }).value || '';
    await handlers.selectWorkflow(
      body.user.id,
      orgId,
      actionValue.slice(3),
      respond,
    );
  });

  app.action('confirm:run', async ({ ack, respond, body }) => {
    await ack();
    await handlers.handleRun(body.user.id, orgId, respond);
  });

  app.action('confirm:edit', async ({ ack, respond, body }) => {
    await ack();
    await handlers.handleEdit(body.user.id, respond);
  });

  app.action('confirm:cancel', async ({ ack, respond, body }) => {
    await ack();
    handlers.deleteSession(body.user.id);
    await respond({
      replace_original: true,
      text: 'Cancelled. Use /workflows to start again.',
    });
  });

  app.action(/^cfg:img:/, async ({ action, ack, respond, body }) => {
    await ack();
    const model = ((action as { value?: string }).value || '').slice(8);
    const settings = handlers.getUserSettings(body.user.id) || {
      imageModel: IMAGE_MODELS[0],
      videoModel: VIDEO_MODELS[0],
    };
    settings.imageModel = model;
    handlers.setUserSettings(body.user.id, settings);
    await respond({ text: `Image model set to: *${model}*` });
  });

  app.action(/^cfg:vid:/, async ({ action, ack, respond, body }) => {
    await ack();
    const model = ((action as { value?: string }).value || '').slice(8);
    const settings = handlers.getUserSettings(body.user.id) || {
      imageModel: IMAGE_MODELS[0],
      videoModel: VIDEO_MODELS[0],
    };
    settings.videoModel = model;
    handlers.setUserSettings(body.user.id, settings);
    await respond({ text: `Video model set to: *${model}*` });
  });

  app.message(async ({ message, say }) => {
    const msg = message as { user?: string; text?: string };
    if (!msg.user || !msg.text) {
      return;
    }

    const session = handlers.getSession(msg.user);
    if (!session || session.state !== 'collecting') {
      return;
    }

    const currentInput = session.requiredInputs[session.currentInputIndex];
    if (!currentInput || currentInput.inputType !== 'text') {
      return;
    }

    let value = msg.text;
    if (value.toLowerCase() === 'default' && currentInput.defaultValue) {
      value = currentInput.defaultValue;
    }

    session.collectedInputs.set(currentInput.nodeId, value);
    session.currentInputIndex++;
    handlers.setSession(msg.user, session);

    await handlers.promptNextInput(msg.user, say);
  });

  app.event('file_shared', async ({ event, client }) => {
    try {
      const fileInfo = await client.files.info({ file: event.file_id });
      const file = fileInfo.file;
      if (!file || !file.user) {
        return;
      }

      const session = handlers.getSession(file.user);
      if (!session || session.state !== 'collecting') {
        return;
      }

      const currentInput = session.requiredInputs[session.currentInputIndex];
      if (!currentInput || currentInput.inputType !== 'image') {
        return;
      }

      const imageUrl = file.url_private || '';
      session.collectedInputs.set(currentInput.nodeId, imageUrl);
      session.currentInputIndex++;
      handlers.setSession(file.user, session);

      const channel =
        file.channels && file.channels.length > 0
          ? file.channels[0]
          : undefined;
      if (channel) {
        await client.chat.postMessage({
          channel,
          text: 'Image received.',
        });
      }
    } catch (error) {
      handlers.logFileError(error);
    }
  });
}
