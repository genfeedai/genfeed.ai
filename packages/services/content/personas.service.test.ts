import { PersonaAvailabilityMode } from '@genfeedai/contracts';
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

  it('patches character availability and maps the response', async () => {
    const patch = vi.fn().mockResolvedValue({
      data: {
        data: { id: 'p1', type: 'persona', attributes: { label: 'Anna' } },
      },
    });
    (service as unknown as { instance: { patch: typeof patch } }).instance = {
      patch,
    };

    await service.updateAvailability('p1', {
      brandIds: ['b2'],
      mode: PersonaAvailabilityMode.SELECTED_BRANDS,
    });

    expect(patch).toHaveBeenCalledWith('/p1/availability', {
      brandIds: ['b2'],
      mode: PersonaAvailabilityMode.SELECTED_BRANDS,
    });
  });

  it('maps availability fields onto character list items', async () => {
    vi.spyOn(service, 'findAll').mockResolvedValue([
      new Persona({
        availabilityMode: PersonaAvailabilityMode.ALL_BRANDS,
        availableBrandCount: 3,
        availableBrandIds: [],
        handle: 'anna',
        id: 'p1',
        isShared: true,
        label: 'Anna',
        owningBrandId: 'b1',
        owningBrandName: 'Podcast',
      }),
    ]);

    await expect(service.listCharacters()).resolves.toEqual([
      expect.objectContaining({
        availableBrandCount: 3,
        isShared: true,
        owningBrandName: 'Podcast',
      }),
    ]);
  });

  it('lists every character for an explicit brand', async () => {
    const findAllPages = vi
      .spyOn(service, 'findAllPages')
      .mockResolvedValue([new Persona({ id: 'p1', label: 'Anna' })]);
    const signal = new AbortController().signal;

    const result = await service.listAllCharacters({ brandId: 'b2', signal });

    expect(findAllPages).toHaveBeenCalledWith({ brandId: 'b2' }, signal);
    expect(result).toEqual([expect.objectContaining({ id: 'p1' })]);
  });
});
