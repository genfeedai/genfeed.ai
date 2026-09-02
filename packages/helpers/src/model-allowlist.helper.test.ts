import { ModelCategory, ModelProvider } from '@genfeedai/contracts';
import type { IModel } from '@genfeedai/contracts/interfaces';

import {
  filterModelsByOrgAllowlist,
  isModelOnOrgAllowlist,
  resolveOrgAllowlistedModels,
  shouldOfferAutoModel,
} from '@helpers/model-allowlist.helper';

function createModel(
  overrides: Partial<IModel> & Pick<IModel, 'key' | 'label'>,
): IModel {
  return {
    category: ModelCategory.IMAGE,
    cost: 1,
    createdAt: '2026-01-01',
    id: overrides.id ?? overrides.key,
    isActive: true,
    isDefault: false,
    isDeleted: false,
    key: overrides.key,
    label: overrides.label,
    provider: ModelProvider.REPLICATE,
    updatedAt: '2026-01-01',
    ...overrides,
  } as IModel;
}

const flux = createModel({
  id: 'model_flux',
  key: 'black-forest-labs/flux-schnell',
  label: 'FLUX Schnell',
});

const kling = createModel({
  category: ModelCategory.VIDEO,
  id: 'model_kling',
  key: 'kwaivgi/kling-v2.6',
  label: 'Kling 2.6',
});

const nanoBanana = createModel({
  id: 'model_nano',
  key: 'google/nano-banana',
  label: 'Nano Banana',
});

describe('model-allowlist.helper', () => {
  it('treats an allowlisted key or id as visible', () => {
    expect(isModelOnOrgAllowlist(flux, [flux.key])).toBe(true);
    expect(isModelOnOrgAllowlist(kling, [kling.id])).toBe(true);
    expect(
      filterModelsByOrgAllowlist([flux, kling, nanoBanana], [nanoBanana.key]),
    ).toEqual([nanoBanana]);
  });

  it('hides catalog models that are not on the org allowlist', () => {
    expect(isModelOnOrgAllowlist(flux, [nanoBanana.key])).toBe(false);
    expect(filterModelsByOrgAllowlist([flux, kling], [nanoBanana.key])).toEqual(
      [],
    );
  });

  it('returns no models when the allowlist is empty or missing', () => {
    expect(filterModelsByOrgAllowlist([flux, kling], [])).toEqual([]);
    expect(filterModelsByOrgAllowlist([flux, kling], undefined)).toEqual([]);
    expect(filterModelsByOrgAllowlist([flux, kling], null)).toEqual([]);
    expect(shouldOfferAutoModel([])).toBe(false);
  });

  it('keeps the catalog when there is no organization id', () => {
    expect(
      resolveOrgAllowlistedModels([flux, kling], {
        enabledModelIds: [],
        organizationId: '',
      }),
    ).toEqual([flux, kling]);
  });

  it('hides the catalog while org settings are still loading', () => {
    expect(
      resolveOrgAllowlistedModels([flux], {
        enabledModelIds: [flux.key],
        isSettingsReady: false,
        organizationId: 'org_demo',
      }),
    ).toEqual([]);
  });

  it('does not offer Auto when the category allowlist is empty', () => {
    const allowlisted = resolveOrgAllowlistedModels([flux, kling], {
      enabledModelIds: [],
      organizationId: 'org_demo',
    });

    expect(allowlisted).toEqual([]);
    expect(shouldOfferAutoModel(allowlisted)).toBe(false);
  });
});
