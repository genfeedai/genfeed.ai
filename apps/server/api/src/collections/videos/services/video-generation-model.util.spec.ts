import {
  brandPromptLabel,
  emptyStyleToNull,
  optionalBrandString,
  pickVideoModelPreference,
} from './video-generation-model.util';

describe('pickVideoModelPreference', () => {
  const source = {
    defaultImageToVideoModel: 'i2v-model',
    defaultVideoModel: 't2v-model',
  };

  it('selects image-to-video defaults when references are present', () => {
    expect(pickVideoModelPreference(true, source)).toBe('i2v-model');
    expect(pickVideoModelPreference(false, source)).toBe('t2v-model');
  });

  it('returns undefined for missing sources or non-string defaults', () => {
    expect(pickVideoModelPreference(true, null)).toBeUndefined();
    expect(
      pickVideoModelPreference(false, { defaultVideoModel: 12 }),
    ).toBeUndefined();
  });
});

describe('emptyStyleToNull', () => {
  it('stores a blank style as null and otherwise preserves the value', () => {
    expect(emptyStyleToNull('')).toBeNull();
    expect(emptyStyleToNull('cinematic')).toBe('cinematic');
    expect(emptyStyleToNull(undefined)).toBeUndefined();
  });
});

describe('brand prompt fields', () => {
  it('converts nullish brand strings and defaults the label', () => {
    expect(optionalBrandString(null)).toBeUndefined();
    expect(optionalBrandString('desc')).toBe('desc');
    expect(brandPromptLabel(undefined)).toBe('Brand');
    expect(brandPromptLabel('Acme')).toBe('Acme');
  });
});
