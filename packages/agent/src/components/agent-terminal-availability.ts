import { isCloudDeployment } from '@genfeedai/config/deployment';

export function isAgentCliTerminalAvailable(): boolean {
  return !isCloudDeployment();
}
