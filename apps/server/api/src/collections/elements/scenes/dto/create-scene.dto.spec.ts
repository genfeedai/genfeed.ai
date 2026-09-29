import { CreateElementSceneDto } from '@api/collections/elements/scenes/dto/create-scene.dto';

describe('CreateElementSceneDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateElementSceneDto();
      expect(dto).toBeInstanceOf(CreateElementSceneDto);
    });
  });
});
