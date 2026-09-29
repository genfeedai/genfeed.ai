import { replaceDispatchReferenceIds } from '@api/collections/images/services/image-generation-dispatch-references.util';

describe('replaceDispatchReferenceIds', () => {
  const urlById = new Map([
    ['ref_a', 'https://cdn.example.com/ingredients/images/ref_a'],
    ['ref_b', 'https://cdn.example.com/ingredients/images/ref_b'],
  ]);

  it('replaces reference ids inside array fields such as image_input', () => {
    const result = replaceDispatchReferenceIds(
      { image_input: ['ref_a', 'ref_b'], prompt: 'a portrait' },
      urlById,
    );

    expect(result).toEqual({
      image_input: [
        'https://cdn.example.com/ingredients/images/ref_a',
        'https://cdn.example.com/ingredients/images/ref_b',
      ],
      prompt: 'a portrait',
    });
  });

  it('replaces reference ids in single-value fields', () => {
    const result = replaceDispatchReferenceIds(
      { input_image: 'ref_a', prompt: 'a portrait' },
      urlById,
    );

    expect(result.input_image).toBe(
      'https://cdn.example.com/ingredients/images/ref_a',
    );
  });

  it('leaves prompts, existing urls, and unknown values untouched', () => {
    const dispatch = {
      image_input: ['https://cdn.example.com/already-a-url', 'unknown_id'],
      prompt: 'ref_a is only text here',
      seed: 7,
    };

    expect(replaceDispatchReferenceIds(dispatch, urlById)).toEqual(dispatch);
  });

  it('does not mutate the compiled dispatch', () => {
    const dispatch = { image_input: ['ref_a'] };

    replaceDispatchReferenceIds(dispatch, urlById);

    expect(dispatch.image_input).toEqual(['ref_a']);
  });

  it('returns the dispatch as-is when there are no references', () => {
    const dispatch = { prompt: 'a portrait' };

    expect(replaceDispatchReferenceIds(dispatch, new Map())).toBe(dispatch);
  });
});

describe('replaceDispatchReferenceIds with unresolved references', () => {
  const urlById = new Map([
    ['ref_a', 'https://cdn.example.com/ingredients/images/ref_a'],
  ]);
  const unresolved = new Set(['ref_foreign']);

  it('drops unresolved ids from arrays and keeps resolved urls', () => {
    const result = replaceDispatchReferenceIds(
      { image_input: ['ref_foreign', 'ref_a'], prompt: 'a portrait' },
      urlById,
      unresolved,
    );

    expect(result).toEqual({
      image_input: ['https://cdn.example.com/ingredients/images/ref_a'],
      prompt: 'a portrait',
    });
  });

  it('removes a field whose only references were unresolved', () => {
    const arrayResult = replaceDispatchReferenceIds(
      { image_input: ['ref_foreign'], prompt: 'a portrait' },
      new Map(),
      unresolved,
    );
    const stringResult = replaceDispatchReferenceIds(
      { input_image: 'ref_foreign', prompt: 'a portrait' },
      new Map(),
      unresolved,
    );

    expect(arrayResult).toEqual({ prompt: 'a portrait' });
    expect(stringResult).toEqual({ prompt: 'a portrait' });
  });
});
