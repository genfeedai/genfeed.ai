import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Persona, PersonasService } from './personas.service';

describe('PersonasService', () => {
  let service: PersonasService;

  beforeEach(() => {
    service = new PersonasService('personas-token');
  });

  it('reuses a singleton per token', () => {
    const first = PersonasService.getInstance('tok');
    expect(PersonasService.getInstance('tok')).toBe(first);
  });

  it('posts the sheet-prompt body and returns the composed prompt', async () => {
    const post = vi.fn().mockResolvedValue({
      data: { prompt: 'CHARACTER REFERENCE SHEET PRESET v1.0.0\n...' },
    });
    (service as unknown as { instance: { post: typeof post } }).instance = {
      post,
    };

    const result = await service.composeSheetPrompt({
      description: 'a tall woman',
      isNonHumanoid: true,
    });

    expect(post).toHaveBeenCalledWith('/sheet-prompt', {
      description: 'a tall woman',
      isNonHumanoid: true,
    });
    expect(result.prompt).toContain('CHARACTER REFERENCE SHEET PRESET');
  });

  it('creates a persona from an approved sheet', async () => {
    const post = vi.fn().mockResolvedValue({
      data: { data: { handle: 'anna', id: 'p1', label: 'Anna' } },
    });
    (service as unknown as { instance: { post: typeof post } }).instance = {
      post,
    };

    const persona = await service.createFromSheet({
      assetId: 'img-1',
      handle: 'anna',
      label: 'Anna',
    });

    expect(post).toHaveBeenCalledWith('/from-sheet', {
      assetId: 'img-1',
      handle: 'anna',
      label: 'Anna',
    });
    expect(persona).toBeInstanceOf(Persona);
    expect(persona.handle).toBe('anna');
  });
});
