import { IngredientCategory } from '@genfeedai/contracts';
import { Avatar } from '@genfeedai/models/ai/avatar.model';
import { Ingredient } from '@genfeedai/models/content/ingredient.model';
import { GIF } from '@genfeedai/models/ingredients/gif.model';
import { Image } from '@genfeedai/models/ingredients/image.model';
import { Music } from '@genfeedai/models/ingredients/music.model';
import { Video } from '@genfeedai/models/ingredients/video.model';
import { Voice } from '@genfeedai/models/ingredients/voice.model';
import {
  axiosResponse,
  collectionDocument,
  installMockHttp,
  type MockHttpInstance,
  resourceDocument,
} from '@services/__mocks__/http.mock';
import { IngredientsService } from '@services/content/ingredients.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('IngredientsService', () => {
  const token = 'ingredients-token';
  let service: IngredientsService;
  let http: MockHttpInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    IngredientsService.clearInstance();
    service = new IngredientsService('ingredients', token);
    http = installMockHttp(service);
  });

  describe('constructor model mapping', () => {
    const cases: Array<[string, unknown]> = [
      ['avatars', Avatar],
      ['gifs', GIF],
      ['images', Image],
      ['ingredients', Ingredient],
      ['musics', Music],
      ['videos', Video],
      ['voices', Voice],
      ['unknown-category', Ingredient],
    ];

    it.each(cases)('maps %s to its model class', (category, model) => {
      const categoryService = new IngredientsService(category, token);
      expect(categoryService.model).toBe(model);
    });
  });

  describe('getInstance', () => {
    it('supports the (category, token) signature and caches per key', () => {
      const first = IngredientsService.getInstance('videos', token);
      expect(first).toBeInstanceOf(IngredientsService);
      expect(IngredientsService.getInstance('videos', token)).toBe(first);
      expect(IngredientsService.getInstance('images', token)).not.toBe(first);
    });

    it('supports the single token signature with the default category', () => {
      const instance = IngredientsService.getInstance(token);
      expect(instance).toBe(IngredientsService.getInstance(token));
      expect(instance.model).toBe(Ingredient);
    });

    it('clearInstance clears a specific key or everything', () => {
      const scoped = IngredientsService.getInstance('videos', token);
      IngredientsService.clearInstance('videos', token);
      expect(IngredientsService.getInstance('videos', token)).not.toBe(scoped);

      const all = IngredientsService.getInstance(token);
      IngredientsService.clearInstance();
      expect(IngredientsService.getInstance(token)).not.toBe(all);
    });
  });

  describe('post', () => {
    it.each([
      [IngredientCategory.VIDEO],
      [IngredientCategory.IMAGE],
      [IngredientCategory.MUSIC],
      [IngredientCategory.AVATAR],
      ['custom-type'],
    ])('serializes and POSTs to /%s for typed creates', async (type) => {
      http.post.mockResolvedValue(
        axiosResponse(resourceDocument({ label: 'Item' }, { id: 'ing_1' })),
      );

      const result = await service.post(type, { label: 'Item' });

      expect(http.post).toHaveBeenCalledWith(`/${type}`, { label: 'Item' });
      expect(result.id).toBe('ing_1');
    });

    it('falls back to the BaseService post for plain bodies', async () => {
      http.post.mockResolvedValue(
        axiosResponse(resourceDocument({ label: 'Plain' }, { id: 'ing_2' })),
      );

      const result = await service.post({ label: 'Plain' });

      expect(http.post).toHaveBeenCalledWith('', { label: 'Plain' });
      expect(result.id).toBe('ing_2');
    });
  });

  it('findChildren GETs the children collection', async () => {
    http.get.mockResolvedValue(
      axiosResponse(collectionDocument([{ id: 'child_1', label: 'Child' }])),
    );

    const result = await service.findChildren('ing_1');

    expect(http.get).toHaveBeenCalledWith('ing_1/children');
    expect(result[0].id).toBe('child_1');
  });

  describe('findByIds', () => {
    it('returns [] without a request for empty ids', async () => {
      const result = await service.findByIds([]);
      expect(result).toEqual([]);
      expect(http.get).not.toHaveBeenCalled();
    });

    it('GETs the batch endpoint with comma-joined ids', async () => {
      http.get.mockResolvedValue(
        axiosResponse(collectionDocument([{ id: 'ing_1', label: 'A' }])),
      );

      const result = await service.findByIds(['ing_1', 'ing_2']);

      expect(http.get).toHaveBeenCalledWith('batch?ids=ing_1,ing_2');
      expect(result).toHaveLength(1);
    });
  });

  describe('uploads', () => {
    it('postUpload POSTs form data and reports progress', async () => {
      http.post.mockImplementation(
        (
          _url: string,
          _body: FormData,
          config: {
            onUploadProgress: (event: {
              loaded: number;
              total?: number;
            }) => void;
          },
        ) => {
          config.onUploadProgress({ loaded: 50, total: 100 });
          config.onUploadProgress({ loaded: 100 });
          return Promise.resolve(
            axiosResponse(resourceDocument({ label: 'Up' }, { id: 'ing_up' })),
          );
        },
      );
      const progress = vi.fn();
      const formData = new FormData();

      const result = await service.postUpload(formData, progress);

      expect(http.post).toHaveBeenCalledWith(
        'upload',
        formData,
        expect.objectContaining({ timeout: 300_000 }),
      );
      expect(progress).toHaveBeenNthCalledWith(1, 50, 50, 100);
      expect(progress).toHaveBeenNthCalledWith(2, 10000, 100, 0);
      expect(result.id).toBe('ing_up');
    });

    it('getPresignedUploadUrl POSTs file metadata and extracts the resource', async () => {
      http.post.mockResolvedValue(
        axiosResponse(
          resourceDocument(
            {
              expiresIn: 900,
              publicUrl: 'https://cdn/x.png',
              s3Key: 'uploads/x.png',
              uploadUrl: 'https://s3/upload',
            },
            { id: 'upload_1' },
          ),
        ),
      );

      const result = await service.getPresignedUploadUrl(
        'x.png',
        'image/png',
        'image',
      );

      expect(http.post).toHaveBeenCalledWith('upload/presigned', {
        contentType: 'image/png',
        filename: 'x.png',
        type: 'image',
      });
      expect(result).toMatchObject({
        id: 'upload_1',
        s3Key: 'uploads/x.png',
        uploadUrl: 'https://s3/upload',
      });
    });

    it('confirmUpload POSTs the upload confirmation', async () => {
      http.post.mockResolvedValue(
        axiosResponse(resourceDocument({ label: 'Done' }, { id: 'ing_c' })),
      );

      const result = await service.confirmUpload('upload_1');

      expect(http.post).toHaveBeenCalledWith('upload/confirm/upload_1');
      expect(result.id).toBe('ing_c');
    });

    it('uploadDirectToS3 rejects local uploads without key metadata', async () => {
      const file = new File(['bytes'], 'x.png', { type: 'image/png' });

      await expect(
        service.uploadDirectToS3(file, 'https://files.local/v1/files/upload'),
      ).rejects.toThrow(
        'uploadDirectToS3: self-hosted uploads require { key, type }',
      );
    });
  });

  describe('item actions', () => {
    it('vote POSTs to the vote endpoint', async () => {
      http.post.mockResolvedValue(axiosResponse(undefined));

      await service.vote('ing_1', 'vote');
      await service.vote('ing_1', 'unvote');

      expect(http.post).toHaveBeenNthCalledWith(1, 'ing_1/vote');
      expect(http.post).toHaveBeenNthCalledWith(2, 'ing_1/unvote');
    });

    it('postClone POSTs to the clone endpoint', async () => {
      http.post.mockResolvedValue(
        axiosResponse(resourceDocument({ label: 'Clone' }, { id: 'ing_cl' })),
      );

      const result = await service.postClone('ing_1');

      expect(http.post).toHaveBeenCalledWith('ing_1/clone');
      expect(result.id).toBe('ing_cl');
    });

    it('postUpscale POSTs upscale params', async () => {
      http.post.mockResolvedValue(
        axiosResponse(resourceDocument({ label: 'Up' }, { id: 'ing_u' })),
      );

      await service.postUpscale('ing_1', { scale: 2 });

      expect(http.post).toHaveBeenCalledWith('ing_1/upscale', { scale: 2 });
    });

    it('patchMetadata serializes and PATCHes metadata', async () => {
      http.patch.mockResolvedValue(
        axiosResponse(resourceDocument({ label: 'Meta' }, { id: 'ing_m' })),
      );

      await service.patchMetadata('ing_1', { label: 'Meta' });

      expect(http.patch).toHaveBeenCalledWith('ing_1/metadata', {
        label: 'Meta',
      });
    });

    it('refreshMetadata POSTs to the metadata endpoint', async () => {
      http.post.mockResolvedValue(
        axiosResponse(resourceDocument({ label: 'Fresh' }, { id: 'ing_f' })),
      );

      await service.refreshMetadata('ing_1');

      expect(http.post).toHaveBeenCalledWith('ing_1/metadata');
    });

    it('patchTags wraps tag ids in the data envelope', async () => {
      http.patch.mockResolvedValue(
        axiosResponse(resourceDocument({ label: 'Tagged' }, { id: 'ing_t' })),
      );

      await service.patchTags('ing_1', ['tag_1', 'tag_2']);

      expect(http.patch).toHaveBeenCalledWith('ing_1/tags', {
        data: { attributes: { tags: ['tag_1', 'tag_2'] } },
      });
    });

    it('bulkDelete DELETEs with the serialized body', async () => {
      http.delete.mockResolvedValue(
        axiosResponse(resourceDocument({ deletedCount: 2 }, { id: 'bulk_1' })),
      );

      const result = await service.bulkDelete({ ids: ['a', 'b'] });

      expect(http.delete).toHaveBeenCalledWith('', {
        data: { ids: ['a', 'b'] },
      });
      expect(result).toMatchObject({ deletedCount: 2 });
    });

    it('getPosts GETs the posts using an ingredient', async () => {
      http.get.mockResolvedValue(
        axiosResponse(collectionDocument([{ id: 'post_1', label: 'Post' }])),
      );

      const result = await service.getPosts('ing_1');

      expect(http.get).toHaveBeenCalledWith('ing_1/posts');
      expect(result[0]).toMatchObject({ id: 'post_1' });
    });
  });
});
