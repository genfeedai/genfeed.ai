import { BrandDeferredVisualAnalysis } from '@api/services/brand-validation/brand-visual-analysis-deferral';
import { describe, expect, it, vi } from 'vitest';

const scope = { brandId: 'brand-a', organizationId: 'org-a' };
const frames = [new Uint8Array([1])];

describe('BrandDeferredVisualAnalysis', () => {
  it('answers pending for OCR and detection, and records that a reading was wanted', async () => {
    const gate = { isEnabled: vi.fn(async () => true) };
    const deferral = new BrandDeferredVisualAnalysis(gate);
    expect(deferral.isRequested).toBe(false);
    expect(await deferral.extractText({ frames, scope })).toEqual({
      status: 'pending',
    });
    expect(
      await deferral.detectRegions({ frames, query: 'logo', scope }),
    ).toEqual({ status: 'pending' });
    expect(deferral.isRequested).toBe(true);
  });

  it('asks the gate about the organization the reading is attributed to', async () => {
    const gate = { isEnabled: vi.fn(async (_organizationId: string) => true) };
    const deferral = new BrandDeferredVisualAnalysis(gate);
    await deferral.extractText({ frames, scope });
    await deferral.detectRegions({ frames, query: 'logo', scope });
    expect(gate.isEnabled).toHaveBeenNthCalledWith(1, 'org-a');
    expect(gate.isEnabled).toHaveBeenNthCalledWith(2, 'org-a');
  });

  it('answers disabled, and queues nothing, while only the organization has it off', async () => {
    const deferral = new BrandDeferredVisualAnalysis({
      isEnabled: async (organizationId) => organizationId !== 'org-a',
    });
    expect(await deferral.extractText({ frames, scope })).toEqual({
      status: 'disabled',
    });
    expect(deferral.isRequested).toBe(false);
  });

  it('answers disabled, and records nothing, while the platform switch is off', async () => {
    const deferral = new BrandDeferredVisualAnalysis({
      isEnabled: async () => false,
    });
    expect(await deferral.extractText({ frames, scope })).toEqual({
      status: 'disabled',
    });
    expect(deferral.isRequested).toBe(false);
  });

  it('fails closed when the switch cannot be read', async () => {
    const deferral = new BrandDeferredVisualAnalysis({
      isEnabled: async () => {
        throw new Error('db down');
      },
    });
    expect(
      await deferral.detectRegions({ frames, query: 'logo', scope }),
    ).toEqual({ status: 'unavailable' });
    expect(deferral.isRequested).toBe(false);
  });
});
