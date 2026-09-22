import {
  resolveTaskRoutingDecisionRollout,
  TASK_ROUTING_DEFAULT_MIN_CONFIDENCE,
} from '@api/collections/tasks/services/task-routing-decision.config';
import type { ConfigService } from '@libs/config/config.service';

type ConfigValues = Record<string, unknown>;

const configServiceWith = (values: ConfigValues): ConfigService =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

describe('resolveTaskRoutingDecisionRollout', () => {
  it('reads the configured mode and threshold', () => {
    expect(
      resolveTaskRoutingDecisionRollout(
        configServiceWith({
          TASK_ROUTING_DECISION_MODE: 'live',
          TASK_ROUTING_MIN_CONFIDENCE: 0.7,
        }),
      ),
    ).toEqual({ minConfidence: 0.7, mode: 'live' });
  });

  it('defaults to the off mode and the conservative threshold', () => {
    expect(resolveTaskRoutingDecisionRollout(configServiceWith({}))).toEqual({
      minConfidence: TASK_ROUTING_DEFAULT_MIN_CONFIDENCE,
      mode: 'off',
    });
  });

  it.each(['', 'shadow-mode', 'LIVE', 42])(
    'falls back to off for the unvalidated mode %p',
    (mode) => {
      expect(
        resolveTaskRoutingDecisionRollout(
          configServiceWith({ TASK_ROUTING_DECISION_MODE: mode }),
        ).mode,
      ).toBe('off');
    },
  );

  it.each([-0.1, 1.1, Number.NaN, 'high'])(
    'falls back to the default threshold for %p',
    (minConfidence) => {
      expect(
        resolveTaskRoutingDecisionRollout(
          configServiceWith({ TASK_ROUTING_MIN_CONFIDENCE: minConfidence }),
        ).minConfidence,
      ).toBe(TASK_ROUTING_DEFAULT_MIN_CONFIDENCE);
    },
  );

  it('accepts the boundary thresholds', () => {
    expect(
      resolveTaskRoutingDecisionRollout(
        configServiceWith({ TASK_ROUTING_MIN_CONFIDENCE: 0 }),
      ).minConfidence,
    ).toBe(0);
    expect(
      resolveTaskRoutingDecisionRollout(
        configServiceWith({ TASK_ROUTING_MIN_CONFIDENCE: 1 }),
      ).minConfidence,
    ).toBe(1);
  });
});
