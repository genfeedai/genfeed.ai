import { buildImageBriefDirection } from '@api/collections/images/services/image-generation-direction.util';

describe('buildImageBriefDirection', () => {
  it('joins the subject with its action and the style with the mood', () => {
    expect(
      buildImageBriefDirection(
        {
          action: 'walking through rain',
          mood: 'melancholy',
          style: 'cinematic',
          subject: 'a courier',
        },
        'Neon street at night',
      ),
    ).toEqual({
      composition: '',
      subjects: ['a courier walking through rain'],
      visualDirection: 'cinematic, melancholy mood',
    });
  });

  it('leaves out what the objective already says', () => {
    expect(
      buildImageBriefDirection(
        { action: 'walking', mood: 'calm', subject: 'A courier' },
        'A courier at dusk, calm and quiet',
      ),
    ).toEqual({ composition: '', subjects: ['walking'] });
  });

  it('returns nothing when no pick was made', () => {
    expect(buildImageBriefDirection({}, 'a lake')).toEqual({ composition: '' });
  });

  it('joins the camera and lens as the composition', () => {
    expect(
      buildImageBriefDirection(
        { camera: ' low angle ', lens: '35mm' },
        'a lake',
      ).composition,
    ).toBe('low angle, 35mm');
  });

  it('keeps the style on its own', () => {
    expect(
      buildImageBriefDirection({ style: ' realistic ' }, 'a lake'),
    ).toEqual({ composition: '', visualDirection: 'realistic' });
  });
});
