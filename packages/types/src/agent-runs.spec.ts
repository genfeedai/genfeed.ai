import { describe, expect, it } from 'vitest';
import {
  AGENT_RUN_ANOMALY_KINDS,
  AGENT_RUN_ANOMALY_SEVERITIES,
  AGENT_RUN_SORT_MODES,
  AGENT_RUN_TIME_RANGES,
  DEFAULT_AGENT_RUN_SORT_MODE,
  DEFAULT_AGENT_RUN_TIME_RANGE,
} from './agent-runs';

describe('agent-runs', () => {
  it('exposes the sort modes with latest first', () => {
    expect(AGENT_RUN_SORT_MODES).toEqual([
      'latest',
      'credits',
      'duration',
      'model',
    ]);
  });

  it('exposes the supported time ranges', () => {
    expect(AGENT_RUN_TIME_RANGES).toEqual(['7d', '14d', '30d']);
  });

  it('keeps defaults inside their value sets', () => {
    expect(AGENT_RUN_SORT_MODES).toContain(DEFAULT_AGENT_RUN_SORT_MODE);
    expect(AGENT_RUN_TIME_RANGES).toContain(DEFAULT_AGENT_RUN_TIME_RANGE);
    expect(DEFAULT_AGENT_RUN_SORT_MODE).toBe('latest');
    expect(DEFAULT_AGENT_RUN_TIME_RANGE).toBe('7d');
  });

  it('exposes anomaly kinds and severities', () => {
    expect(AGENT_RUN_ANOMALY_KINDS).toEqual([
      'auto_routing_spike',
      'web_enabled_drop',
      'model_concentration',
    ]);
    expect(AGENT_RUN_ANOMALY_SEVERITIES).toEqual([
      'info',
      'warning',
      'critical',
    ]);
  });
});
