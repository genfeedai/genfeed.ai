import { render } from 'ink';
import { TerminalWorkspace, type WorkspaceExitAction } from './workspace';

export async function runTerminalWorkspace(): Promise<WorkspaceExitAction> {
  let action: WorkspaceExitAction = 'exit';
  const instance = render(
    <TerminalWorkspace
      onDone={(nextAction) => {
        action = nextAction;
      }}
    />
  );
  await instance.waitUntilExit();
  return action;
}
