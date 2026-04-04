import { DatasetController } from '@images/controllers/dataset.controller';
import { DatasetService } from '@images/services/dataset.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Mocked } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('DatasetController', () => {
  let controller: DatasetController;
  let datasetService: Mocked<DatasetService>;

  const mockSyncResult = {
    downloaded: 10,
    errors: [],
    failed: 0,
    path: '/datasets/my-dataset',
    slug: 'my-dataset',
  };

  const mockDatasetInfo = {
    imageCount: 10,
    images: ['img1.jpg', 'img2.jpg'],
    path: '/datasets/my-dataset',
    slug: 'my-dataset',
  };

  beforeEach(async () => {
    const mockDatasetService = {
      deleteDataset: vi.fn().mockResolvedValue({ deleted: true }),
      getDataset: vi.fn().mockResolvedValue(mockDatasetInfo),
      syncDataset: vi.fn().mockResolvedValue(mockSyncResult),
    } as unknown as Mocked<DatasetService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DatasetController],
      providers: [{ provide: DatasetService, useValue: mockDatasetService }],
    }).compile();

    controller = module.get<DatasetController>(DatasetController);
    datasetService = module.get(DatasetService);

    vi.clearAllMocks();
  });

  describe('syncDataset', () => {
    it('should call datasetService.syncDataset with slug and body', async () => {
      const body = { s3Keys: ['key1.jpg', 'key2.jpg'] };

      await controller.syncDataset('my-dataset', body);

      expect(datasetService.syncDataset).toHaveBeenCalledWith(
        'my-dataset',
        body,
      );
    });

    it('should return the sync result from the service', async () => {
      const body = { s3Keys: ['key1.jpg'] };

      const result = await controller.syncDataset('my-dataset', body);

      expect(result).toEqual(mockSyncResult);
    });

    it('should pass through bucket when provided in body', async () => {
      const body = { bucket: 'custom-bucket', s3Keys: ['key.jpg'] };

      await controller.syncDataset('my-dataset', body);

      expect(datasetService.syncDataset).toHaveBeenCalledWith(
        'my-dataset',
        expect.objectContaining({ bucket: 'custom-bucket' }),
      );
    });

    it('should propagate service errors to caller', async () => {
      datasetService.syncDataset = vi
        .fn()
        .mockRejectedValue(new Error('S3 error'));

      await expect(
        controller.syncDataset('bad-slug', { s3Keys: [] }),
      ).rejects.toThrow('S3 error');
    });
  });

  describe('getDataset', () => {
    it('should call datasetService.getDataset with slug', async () => {
      await controller.getDataset('my-dataset');

      expect(datasetService.getDataset).toHaveBeenCalledWith('my-dataset');
    });

    it('should return dataset info', async () => {
      const result = await controller.getDataset('my-dataset');

      expect(result).toEqual(mockDatasetInfo);
    });

    it('should propagate not-found errors', async () => {
      datasetService.getDataset = vi
        .fn()
        .mockRejectedValue(new Error('Dataset not found'));

      await expect(controller.getDataset('missing')).rejects.toThrow(
        'Dataset not found',
      );
    });
  });

  describe('deleteDataset', () => {
    it('should call datasetService.deleteDataset with slug', async () => {
      await controller.deleteDataset('my-dataset');

      expect(datasetService.deleteDataset).toHaveBeenCalledWith('my-dataset');
    });

    it('should return delete result from service', async () => {
      datasetService.deleteDataset = vi
        .fn()
        .mockResolvedValue({ deleted: true, slug: 'my-dataset' });

      const result = await controller.deleteDataset('my-dataset');

      expect(result).toMatchObject({ deleted: true });
    });

    it('should propagate service errors', async () => {
      datasetService.deleteDataset = vi
        .fn()
        .mockRejectedValue(new Error('Delete failed'));

      await expect(controller.deleteDataset('my-dataset')).rejects.toThrow(
        'Delete failed',
      );
    });
  });
});
