import type { IModel } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import {
  resolveStudioGenerationCostModels,
  resolveStudioGenerationMeter,
} from './resolve-studio-generation-meter';

const model = (overrides: Partial<IModel> = {}): IModel =>
  ({
    cost: 10,
    id: 'model-1',
    isDefault: false,
    key: 'flux',
    label: 'Flux',
    ...overrides,
  }) as IModel;

describe('resolveStudioGenerationCostModels', () => {
  it('uses selected models as an exact price', () => {
    const selected = [model({ cost: 15, key: 'kling' })];

    expect(
      resolveStudioGenerationCostModels({
        catalog: [model(), ...selected],
        defaultModelKey: 'flux',
        selectedModels: selected,
      }),
    ).toEqual({ isEstimate: false, models: selected });
  });

  it('falls back to the default catalog key as an estimate', () => {
    const catalog = [model({ cost: 8, key: 'flux' }), model({ key: 'kling' })];

    expect(
      resolveStudioGenerationCostModels({
        catalog,
        defaultModelKey: 'flux',
        selectedModels: [],
      }),
    ).toEqual({ isEstimate: true, models: [catalog[0]] });
  });

  it('falls back to the catalog default flag when the key is missing', () => {
    const catalog = [model({ key: 'a' }), model({ isDefault: true, key: 'b' })];

    expect(
      resolveStudioGenerationCostModels({
        catalog,
        defaultModelKey: 'missing',
        selectedModels: [],
      }),
    ).toEqual({ isEstimate: true, models: [catalog[1]] });
  });

  it('falls back to the first catalog model when nothing else matches', () => {
    const catalog = [model({ key: 'only' })];

    expect(
      resolveStudioGenerationCostModels({
        catalog,
        selectedModels: [],
      }),
    ).toEqual({ isEstimate: true, models: catalog });
  });

  it('returns an empty estimate when the catalog is empty', () => {
    expect(
      resolveStudioGenerationCostModels({
        catalog: [],
        selectedModels: [],
      }),
    ).toEqual({ isEstimate: true, models: [] });
  });
});

describe('resolveStudioGenerationMeter', () => {
  it('hides when credits and queue are both zero', () => {
    expect(
      resolveStudioGenerationMeter({
        credits: 0,
        isEstimate: false,
        queuedCount: 0,
      }),
    ).toBeNull();
  });

  it('shows an exact credit count', () => {
    expect(
      resolveStudioGenerationMeter({
        credits: 15,
        isEstimate: false,
        queuedCount: 0,
      }),
    ).toEqual({
      ariaLabel: '15 credits',
      credits: 15,
      isEstimate: false,
      label: '15 cr',
      queuedCount: 0,
    });
  });

  it('marks auto-select cost as an estimate', () => {
    expect(
      resolveStudioGenerationMeter({
        credits: 12,
        isEstimate: true,
        queuedCount: 0,
      }),
    ).toEqual({
      ariaLabel: 'About 12 credits',
      credits: 12,
      isEstimate: true,
      label: '~12 cr',
      queuedCount: 0,
    });
  });

  it('shows queue-only when credits are zero', () => {
    expect(
      resolveStudioGenerationMeter({
        credits: 0,
        isEstimate: true,
        queuedCount: 2,
      }),
    ).toEqual({
      ariaLabel: '2 generations queued',
      credits: 0,
      isEstimate: true,
      label: '2 queued',
      queuedCount: 2,
    });
  });

  it('joins credits and live queue depth', () => {
    expect(
      resolveStudioGenerationMeter({
        credits: 10,
        isEstimate: false,
        queuedCount: 2,
      }),
    ).toEqual({
      ariaLabel: '10 credits. 2 generations queued',
      credits: 10,
      isEstimate: false,
      label: '10 cr · 2 queued',
      queuedCount: 2,
    });
  });

  it('never uses unlimited copy', () => {
    const meter = resolveStudioGenerationMeter({
      credits: 99,
      isEstimate: true,
      queuedCount: 3,
    });

    expect(meter?.label.toLowerCase()).not.toContain('unlimited');
    expect(meter?.ariaLabel.toLowerCase()).not.toContain('unlimited');
  });
});
