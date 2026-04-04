import { Preset } from '@api/collections/presets/entities/preset.entity';

describe('Preset', () => {
  it('should be defined', () => {
    expect(Preset).toBeDefined();
  });

  it('should create an instance', () => {
    const entity = new Preset({});
    expect(entity).toBeInstanceOf(Preset);
  });

  // describe('properties', () => {
  //   it('should have expected properties', () => {
  //     const entity = new Preset({});
  //     // Test properties
  //   });
  // });
});
