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

  it('looks up which characters use the assets as references', async () => {
    const usage = [
      {
        characters: [{ handle: 'vincent', id: 'p1', label: 'Vincent' }],
        ingredientId: 'img-1',
      },
    ];
    const post = vi.fn().mockResolvedValue({ data: { data: usage } });
    (service as unknown as { instance: { post: typeof post } }).instance = {
      post,
    };

    const result = await service.findReferenceUsage(['img-1', 'img-1']);

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(
      '/reference-usage',
      { ingredientIds: ['img-1'] },
      { signal: undefined },
    );
    expect(result).toEqual(usage);
  });

  it('splits a lookup larger than the endpoint cap into several requests', async () => {
    const post = vi.fn().mockResolvedValue({ data: { data: [] } });
    (service as unknown as { instance: { post: typeof post } }).instance = {
      post,
    };
    const ids = Array.from({ length: 101 }, (_, index) => `img-${index}`);

    await service.findReferenceUsage(ids);

    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[0][1].ingredientIds).toHaveLength(100);
    expect(post.mock.calls[1][1].ingredientIds).toEqual(['img-100']);
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

  it('moves the owning brand through the ownership route', async () => {
    const patch = vi.fn().mockResolvedValue({
      data: {
        data: { id: 'p1', type: 'persona', attributes: { label: 'Anna' } },
      },
    });
    (service as unknown as { instance: { patch: typeof patch } }).instance = {
      patch,
    };

    await service.moveOwnership('p1', 'b2');

    expect(patch).toHaveBeenCalledWith('/p1/owner', { brandId: 'b2' });
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
