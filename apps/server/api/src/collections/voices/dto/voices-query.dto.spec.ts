import { VoicesQueryDto } from '@api/collections/voices/dto/voices-query.dto';
import { plainToInstance } from 'class-transformer';

describe('VoicesQueryDto', () => {
  it('should be defined', () => {
    expect(VoicesQueryDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new VoicesQueryDto();
      expect(dto).toBeInstanceOf(VoicesQueryDto);
    });

    it('normalizes repeated status query keys into an array', () => {
      const dto = plainToInstance(VoicesQueryDto, {
        status: ['generated', 'processing'],
      });

      expect(dto.status).toEqual(['generated', 'processing']);
    });

    it('normalizes a singleton status query into a single-item array', () => {
      const dto = plainToInstance(VoicesQueryDto, {
        status: 'generated',
      });

      expect(dto.status).toEqual(['generated']);
    });

    it('normalizes comma-separated providers into an array', () => {
      const dto = plainToInstance(VoicesQueryDto, {
        providers: 'elevenlabs,genfeed_ai',
      });

      expect(dto.providers).toEqual(['elevenlabs', 'genfeed_ai']);
    });

    it('normalizes comma-separated voice sources into an array', () => {
      const dto = plainToInstance(VoicesQueryDto, {
        voiceSource: 'catalog,cloned',
      });

      expect(dto.voiceSource).toEqual(['catalog', 'cloned']);
    });
  });
});
