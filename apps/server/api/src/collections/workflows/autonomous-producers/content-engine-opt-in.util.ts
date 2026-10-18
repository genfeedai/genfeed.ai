import { readRecord } from '@genfeedai/utils/data/extract.util';

/**
 * Whether a brand agent config opts the brand in to the content engine: the
 * same condition the engine's discovery uses to pick the brand up.
 */
export function isContentEngineOptedIn(agentConfig: unknown): boolean {
  const config = readRecord(agentConfig);
  const strategy = readRecord(config.strategy);
  return (
    readRecord(config.autoPublish).enabled === true &&
    Array.isArray(strategy.contentTypes) &&
    strategy.contentTypes.length > 0
  );
}
