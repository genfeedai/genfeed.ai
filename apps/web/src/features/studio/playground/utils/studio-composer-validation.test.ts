import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { IModel } from '@genfeedai/contracts/interfaces';
import type { StudioPlaygroundType } from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import type { PromptBarAttachedAsset } from '@genfeedai/props/studio/prompt-bar.props';
import { describe, expect, it } from 'vitest';
import { resolveStudioComposerValidation } from '@/features/studio/playground/utils/studio-composer-validation';
import { getDefaultStudioPlaygroundSettings } from '@/features/studio/playground/utils/studio-playground-settings';
import { resolveStudioPlaygroundCapabilities } from '@/features/studio/playground/utils/studio-playground-types';

function asset(role: string, id = role): PromptBarAttachedAsset {
  return { id, name: id, role } as PromptBarAttachedAsset;
}

function model(key: string): IModel {
  return { key } as IModel;
}

function validate(
  type: StudioPlaygroundType,
  overrides: Partial<Parameters<typeof resolveStudioComposerValidation>[0]> & {
    modelKey?: string;
    resolution?: string;
  } = {},
) {
  const { modelKey, resolution, ...rest } = overrides;
  const settings = {
    ...getDefaultStudioPlaygroundSettings(type),
    ...(modelKey ? { modelKey } : {}),
    ...(resolution ? { resolution } : {}),
  };
  return resolveStudioComposerValidation({
    attachedAssets: [],
    capabilities: resolveStudioPlaygroundCapabilities(type, settings.modelKey),
    inputMediaKind: undefined,
    isAutoMode: false,
    isLoadingModels: false,
    models: [],
    selectedModel: undefined,
    settings,
    type,
    ...rest,
  });
}

describe('resolveStudioComposerValidation', () => {
  it('accepts an empty image form', () => {
    expect(validate('image')).toMatchObject({
      isAudioReferenceInvalid: false,
      isAwaitingModels: false,
      isEditSourceMissing: false,
      isEditingModelUnavailable: false,
      isFirstFrameMissing: false,
      isKling4KReferenceInvalid: false,
      isReferenceCombinationInvalid: false,
    });
  });

  it('asks for a source image before an edit', () => {
    expect(
      validate('image-edit', { selectedModel: model('any') }),
    ).toMatchObject({ isEditSourceMissing: true });
    expect(
      validate('image-edit', {
        attachedAssets: [asset('editSource')],
        selectedModel: model('any'),
      }),
    ).toMatchObject({
      editSources: [asset('editSource')],
      isEditSourceMissing: false,
    });
  });

  it('flags an edit with no model once the catalog has loaded', () => {
    expect(
      validate('image-edit', { attachedAssets: [asset('editSource')] }),
    ).toMatchObject({ isEditingModelUnavailable: true });
    expect(
      validate('image-edit', {
        attachedAssets: [asset('editSource')],
        isLoadingModels: true,
      }),
    ).toMatchObject({ isEditingModelUnavailable: false });
  });

  it('treats the edit mask as its own role', () => {
    expect(
      validate('image-edit', {
        attachedAssets: [asset('editSource'), asset('editMask')],
        selectedModel: model('any'),
      }),
    ).toMatchObject({ hasEditMask: true, isEditSourceMissing: false });
  });

  it('rejects audio references on a type or model that takes none', () => {
    expect(
      validate('image', { attachedAssets: [asset('audioReference')] }),
    ).toMatchObject({ isAudioReferenceInvalid: true });
  });

  it('rejects video references combined with frames on Seedance', () => {
    expect(
      validate('video', {
        attachedAssets: [asset('videoReference'), asset('startFrame')],
        modelKey: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
      }),
    ).toMatchObject({ isReferenceCombinationInvalid: true });
    expect(
      validate('video', {
        attachedAssets: [asset('videoReference')],
        modelKey: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
      }),
    ).toMatchObject({ isReferenceCombinationInvalid: false });
  });

  it('rejects a video reference at 4K on Kling Omni', () => {
    expect(
      validate('video', {
        attachedAssets: [asset('videoReference')],
        modelKey: MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_OMNI_VIDEO,
        resolution: '4k',
      }),
    ).toMatchObject({ isKling4KReferenceInvalid: true });
  });

  it('waits for the model catalog to load', () => {
    expect(validate('image', { isLoadingModels: true })).toMatchObject({
      isAwaitingModels: true,
    });
    expect(validate('image', { isLoadingModels: false })).toMatchObject({
      isAwaitingModels: false,
    });
  });

  it('needs an avatar and a voice for an avatar video, and a voice for a clip', () => {
    expect(validate('avatar')).toMatchObject({ isIdentityMissing: true });
    expect(validate('voice')).toMatchObject({ isIdentityMissing: true });
    expect(validate('image')).toMatchObject({ isIdentityMissing: false });
  });
});
