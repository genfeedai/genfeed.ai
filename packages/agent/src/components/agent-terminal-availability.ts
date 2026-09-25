import { getGenfeedDesktopBridge } from '@genfeedai/agent/utils/desktop-bridge.util';
import { isCloudDeployment } from '@genfeedai/config/deployment';

/**
 * The terminal runs on the user's own machine: through the self-hosted
 * socket gateway, or through Genfeed Desktop's node-pty bridge — the latter
 * also when the API is Genfeed Cloud.
 */
export function isAgentCliTerminalAvailable(): boolean {
  return getGenfeedDesktopBridge() !== null || !isCloudDeployment();
}
