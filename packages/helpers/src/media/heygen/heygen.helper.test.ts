import {
  heygenAvatars,
  heygenVoices,
} from '@helpers/media/heygen/heygen.helper';
import { describe, expect, it } from 'vitest';

describe('heygen.helper', () => {
  it('exposes default HeyGen voices', () => {
    expect(heygenVoices).toHaveLength(2);
    expect(heygenVoices[0]).toMatchObject({
      gender: 'Male',
      name: 'Paul',
      provider: 'heygen',
    });
    expect(heygenVoices[1]).toMatchObject({
      gender: 'female',
      name: 'Christine',
      provider: 'heygen',
    });
  });

  it('exposes default HeyGen avatars', () => {
    expect(heygenAvatars).toHaveLength(2);
    expect(heygenAvatars[0]).toMatchObject({
      avatarId: 'Artur_standing_office_side',
      gender: 'male',
    });
    expect(heygenAvatars[1]).toMatchObject({
      avatarId: 'Chloe_standing_lounge_front',
      gender: 'female',
    });
  });
});
