import { buildDiscordConfirmationMessage } from '@discord/services/discord-confirmation';
import type { WorkflowSession } from '@genfeedai/integrations';

function createSession(overrides: Partial<WorkflowSession>): WorkflowSession {
  return {
    collectedInputs: new Map(),
    currentInputIndex: 0,
    requiredInputs: [],
    startedAt: Date.now(),
    state: 'confirming',
    ...overrides,
  };
}

describe('buildDiscordConfirmationMessage', () => {
  it('should render the workflow name with no inputs', () => {
    const session = createSession({ workflowName: 'Image Gen' });

    const { content, row } = buildDiscordConfirmationMessage(session);

    expect(content).toContain('**Review your inputs:**');
    expect(content).toContain('**Workflow:** Image Gen');
    expect(row.components).toHaveLength(3);
  });

  it('should render collected text values by label', () => {
    const session = createSession({
      collectedInputs: new Map([['node-1', 'a red panda']]),
      requiredInputs: [
        { inputType: 'text', label: 'Prompt', nodeId: 'node-1' },
      ],
      workflowName: 'Image Gen',
    });

    const { content } = buildDiscordConfirmationMessage(session);

    expect(content).toContain('**Prompt:** a red panda');
  });

  it('should mask image inputs as uploaded', () => {
    const session = createSession({
      collectedInputs: new Map([['node-img', 'https://cdn/img.png']]),
      requiredInputs: [
        { inputType: 'image', label: 'Reference', nodeId: 'node-img' },
      ],
    });

    const { content } = buildDiscordConfirmationMessage(session);

    expect(content).toContain('**Reference:** [Image uploaded]');
    expect(content).not.toContain('https://cdn/img.png');
  });

  it('should show (empty) for missing values', () => {
    const session = createSession({
      requiredInputs: [
        { inputType: 'text', label: 'Prompt', nodeId: 'node-1' },
      ],
    });

    const { content } = buildDiscordConfirmationMessage(session);

    expect(content).toContain('**Prompt:** (empty)');
  });

  it('should build Run, Edit and Cancel buttons', () => {
    const session = createSession({ workflowName: 'Video Gen' });

    const { row } = buildDiscordConfirmationMessage(session);
    const customIds = row.components.map((component) => {
      const json = component.toJSON();
      return 'custom_id' in json ? json.custom_id : undefined;
    });

    expect(customIds).toEqual([
      'confirm:run',
      'confirm:edit',
      'confirm:cancel',
    ]);
  });
});
