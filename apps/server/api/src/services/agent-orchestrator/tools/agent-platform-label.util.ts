/**
 * Agent-side re-export of the canonical platform parse/label helpers.
 * Prefer importing from `@genfeedai/contracts` in new code.
 */
export {
  formatPlatformLabel as formatAgentPlatformLabel,
  isTwitterPlatform,
  Platform as AgentPlatform,
  parsePlatform,
} from '@genfeedai/contracts';
