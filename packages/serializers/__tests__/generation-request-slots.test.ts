import { imageGenerationRequestAttributes } from '@serializers/attributes/ingredients/image.attributes';
import { videoGenerationRequestAttributes } from '@serializers/attributes/ingredients/video.attributes';
import { describe, expect, it } from 'vitest';

// The create DTOs accept `subject` and `action`, but a field missing from these
// request allowlists is dropped before the request leaves the client, so a
// subject typed in Studio never reached the API.
describe('generation request slots', () => {
  it.each([
    ['image', imageGenerationRequestAttributes],
    ['video', videoGenerationRequestAttributes],
  ])('sends subject and action with a %s generation', (_kind, attributes) => {
    expect(attributes).toEqual(expect.arrayContaining(['subject', 'action']));
  });
});
