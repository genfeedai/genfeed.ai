import {
  promptRenderRecord,
  promptSlotColumns,
} from '@api/collections/prompts/utils/prompt-slots.util';

describe('promptSlotColumns', () => {
  it('keeps only the filled slots and renames avoid to blacklists', () => {
    expect(
      promptSlotColumns({
        action: 'running',
        blacklist: ['blur'],
        cameraMovement: ' dolly in ',
        lighting: '',
        subject: 'a dog',
      }),
    ).toEqual({
      action: 'running',
      blacklists: ['blur'],
      cameraMovement: 'dolly in',
      subject: 'a dog',
    });
  });

  it('returns an empty object when nothing was filled in', () => {
    expect(promptSlotColumns({})).toEqual({});
  });
});

describe('promptRenderRecord', () => {
  it('records the sent text as prose', () => {
    expect(promptRenderRecord('a dog running.')).toEqual({
      renderTarget: 'prose',
      renderedPrompt: 'a dog running.',
    });
  });
});
