import { ImagesToVideoConfig } from '@libs/interfaces/video.interface';

describe('ImagesToVideoConfig', () => {
  it('should have required video config properties', () => {
    const config: ImagesToVideoConfig = {
      outputFps: 30,
      transitionDuration: 500,
      zoomFactor: '1.2',
    };

    expect(config.outputFps).toBe(30);
    expect(config.zoomFactor).toBe('1.2');
    expect(config.transitionDuration).toBe(500);
  });

  it('should allow valid fps values', () => {
    const config1: ImagesToVideoConfig = {
      outputFps: 24,
      transitionDuration: 0,
      zoomFactor: '1.0',
    };

    const config2: ImagesToVideoConfig = {
      outputFps: 60,
      transitionDuration: 1000,
      zoomFactor: '2.0',
    };

    expect(config1.outputFps).toBe(24);
    expect(config2.outputFps).toBe(60);
  });

  it('should allow zoomFactor as string', () => {
    const config: ImagesToVideoConfig = {
      outputFps: 30,
      transitionDuration: 300,
      zoomFactor: '1.5',
    };

    expect(typeof config.zoomFactor).toBe('string');
    expect(config.zoomFactor).toBe('1.5');
  });

  it('should allow transitionDuration as number', () => {
    const config: ImagesToVideoConfig = {
      outputFps: 30,
      transitionDuration: 0,
      zoomFactor: '1.0',
    };

    expect(typeof config.transitionDuration).toBe('number');
    expect(config.transitionDuration).toBe(0);
  });
});
