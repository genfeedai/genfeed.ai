import { UpdateElementSceneDto } from '@api/collections/elements/scenes/dto/update-scene.dto';

describe('UpdateElementSceneDto', () => {
  it('should be defined', () => {
    expect(UpdateElementSceneDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateElementSceneDto();
      expect(dto).toBeInstanceOf(UpdateElementSceneDto);
    });
  });
});
