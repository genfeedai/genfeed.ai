import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { StudioPlaygroundType } from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import { describe, expect, it, vi } from 'vitest';
import { resolveStudioPlaygroundCapabilities } from '@/features/studio/playground/utils/studio-playground-types';
import { buildStudioReferenceSources } from '@/features/studio/playground/utils/studio-reference-sources';
import type { StudioReferenceSourcesInput } from '@/features/studio/props/studio-playground-composer.props';

const LABELS = {
  audioReference: 'Audio reference',
  editMask: 'Mask',
  editSources: 'Source images',
  endFrame: 'End frame',
  reference: 'Reference',
  startFrame: 'Start frame',
  videoReference: 'Video reference',
};

function build(
  type: StudioPlaygroundType,
  overrides: Partial<StudioReferenceSourcesInput> = {},
) {
  const modelKey = overrides.modelKey ?? 'any-model';
  return buildStudioReferenceSources({
    audioReferenceCount: 0,
    capabilities: resolveStudioPlaygroundCapabilities(type, modelKey),
    editSourceCount: 0,
    editSourceLimit: 3,
    inputMediaKind: undefined,
    isAutoMode: false,
    isCrunStartEnd: false,
    isFlux: false,
    isUploading: false,
    labels: LABELS,
    modelKey,
    onAddFiles: vi.fn(),
    onOpenLibrary: vi.fn(),
    type,
    ...overrides,
  });
}

describe('buildStudioReferenceSources', () => {
  it('offers one reference source for an image', () => {
    expect(build('image').map((source) => source.id)).toEqual(['reference']);
  });

  it('offers source images and a mask for an edit', () => {
    expect(build('image-edit').map((source) => source.id)).toEqual([
      'editSource',
      'editMask',
    ]);
  });

  it('drops the mask for FLUX edits', () => {
    expect(
      build('image-edit', { isFlux: true }).map((source) => source.id),
    ).toEqual(['editSource']);
  });

  it('fills the source images once the model limit is reached', () => {
    const [sources] = build('image-edit', {
      editSourceCount: 3,
      editSourceLimit: 3,
    });
    expect(sources).toMatchObject({
      isAttachmentDisabled: true,
      isLibraryDisabled: true,
      label: 'Source images',
    });
  });

  it('disables attaching while a file uploads, but keeps the library open', () => {
    expect(build('image', { isUploading: true })[0]).toMatchObject({
      isAttachmentDisabled: true,
      isLibraryDisabled: false,
    });
  });

  it('routes Auto video to a model that takes both frames', () => {
    expect(
      build('video', {
        isAutoMode: true,
        modelKey: 'auto',
      }).map((source) => source.id),
    ).toEqual(['startFrame', 'endFrame']);
  });

  it('keeps a Crun video contract to the frames it declares', () => {
    expect(
      build('video', {
        inputMediaKind: 'video',
        isCrunStartEnd: true,
      }).map((source) => source.id),
    ).toEqual(['startFrame', 'endFrame']);
    expect(
      build('video', { inputMediaKind: 'video' }).map((source) => source.id),
    ).toEqual([]);
  });

  it('offers audio references on a model that takes them', () => {
    expect(
      build('video', { modelKey: MODEL_KEYS.REPLICATE_MINIMAX_H3 }).map(
        (source) => source.id,
      ),
    ).toContain('audioReference');
  });

  it('adds the role to files and library requests', () => {
    const onAddFiles = vi.fn();
    const onOpenLibrary = vi.fn();
    const [source] = build('image', { onAddFiles, onOpenLibrary });
    const file = new File(['x'], 'x.png');
    source.onAddFiles?.([file]);
    source.onOpenLibrary?.();
    expect(onAddFiles).toHaveBeenCalledWith([file], 'reference');
    expect(onOpenLibrary).toHaveBeenCalledWith('reference');
  });
});
