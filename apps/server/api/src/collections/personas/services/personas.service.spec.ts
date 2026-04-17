import { PersonasService } from '@api/collections/personas/services/personas.service';
import { NotFoundException } from '@nestjs/common';

describe('PersonasService', () => {
  describe('assignMembers', () => {
    const personaId = 'test-object-id';
    const organization = 'test-object-id';
    const memberIds = ['test-object-id', 'test-object-id'];

    it('filters by organization and personaId', async () => {
      const mockExec = vi
        .fn()
        .mockResolvedValue({ _id: personaId, assignedMembers: memberIds });
      const mockFindOneAndUpdate = vi.fn().mockReturnValue({ exec: mockExec });
      const mockModel = { findOneAndUpdate: mockFindOneAndUpdate } as any;

      const service = new PersonasService(mockModel, {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as any);

      await service.assignMembers(personaId, memberIds, organization);

      expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: personaId,
          isDeleted: false,
          organization,
        }),
        { $set: { assignedMembers: memberIds } },
        { new: true },
      );
    });

    it('throws NotFoundException when persona not found in organization', async () => {
      const mockExec = vi.fn().mockResolvedValue(null);
      const mockFindOneAndUpdate = vi.fn().mockReturnValue({ exec: mockExec });
      const mockModel = { findOneAndUpdate: mockFindOneAndUpdate } as never;

      const service = new PersonasService(mockModel, {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as never);

      await expect(
        service.assignMembers(personaId, memberIds, organization),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the updated persona document', async () => {
      const updatedDoc = {
        _id: personaId,
        assignedMembers: memberIds,
        label: 'Test Persona',
      };
      const mockExec = vi.fn().mockResolvedValue(updatedDoc);
      const mockFindOneAndUpdate = vi.fn().mockReturnValue({ exec: mockExec });
      const mockModel = { findOneAndUpdate: mockFindOneAndUpdate } as never;

      const service = new PersonasService(mockModel, {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as never);

      const result = await service.assignMembers(
        personaId,
        memberIds,
        organization,
      );
      expect(result).toEqual(updatedDoc);
    });

    it('uses { new: true } option to return updated document', async () => {
      const mockExec = vi
        .fn()
        .mockResolvedValue({ _id: personaId, assignedMembers: memberIds });
      const mockFindOneAndUpdate = vi.fn().mockReturnValue({ exec: mockExec });
      const mockModel = { findOneAndUpdate: mockFindOneAndUpdate } as never;

      const service = new PersonasService(mockModel, {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as never);

      await service.assignMembers(personaId, memberIds, organization);

      expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.objectContaining({ new: true }),
      );
    });

    it('sets assignedMembers with $set operator', async () => {
      const mockExec = vi.fn().mockResolvedValue({ _id: personaId });
      const mockFindOneAndUpdate = vi.fn().mockReturnValue({ exec: mockExec });
      const mockModel = { findOneAndUpdate: mockFindOneAndUpdate } as never;

      const service = new PersonasService(mockModel, {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as never);

      await service.assignMembers(personaId, memberIds, organization);

      expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
        expect.any(Object),
        { $set: { assignedMembers: memberIds } },
        expect.any(Object),
      );
    });

    it('handles empty memberIds array', async () => {
      const emptyMembers: string[] = [];
      const mockExec = vi
        .fn()
        .mockResolvedValue({ _id: personaId, assignedMembers: [] });
      const mockFindOneAndUpdate = vi.fn().mockReturnValue({ exec: mockExec });
      const mockModel = { findOneAndUpdate: mockFindOneAndUpdate } as never;

      const service = new PersonasService(mockModel, {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as never);

      const result = await service.assignMembers(
        personaId,
        emptyMembers,
        organization,
      );
      expect(result?.assignedMembers).toEqual([]);
    });
  });
});
