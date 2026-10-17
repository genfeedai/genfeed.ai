import {
  resolveAssetProcessingUrl,
  resolveIngredientProcessingUrl,
} from '@api/services/media-urls/processing-media-url.util';
import { describe, expect, it, vi } from 'vitest';

const ASSET = {
  id: 'asset-1',
  storageKey: 'images/asset-1',
  storageType: 'images',
};

function issuer(url?: string) {
  return {
    issueServerPublish: vi
      .fn()
      .mockResolvedValue(new Map(url ? [['asset-1', url]] : [])),
  };
}

describe('resolveIngredientProcessingUrl', () => {
  it('uses the public ingredients endpoint when authorized delivery is off', async () => {
    const authorizedMediaUrls = issuer('https://signed.test/a');

    await expect(
      resolveIngredientProcessingUrl(
        {
          authorizedMediaUrls,
          configService: {
            ingredientsEndpoint: 'https://cdn.test/ingredients',
            isAuthorizedMediaDeliveryEnabled: false,
          },
        },
        'org-1',
        'asset-1',
        'images',
      ),
    ).resolves.toBe('https://cdn.test/ingredients/images/asset-1');
    expect(authorizedMediaUrls.issueServerPublish).not.toHaveBeenCalled();
  });

  it('issues an authorized URL when delivery is on', async () => {
    const authorizedMediaUrls = issuer('https://signed.test/a');

    await expect(
      resolveIngredientProcessingUrl(
        {
          authorizedMediaUrls,
          configService: {
            ingredientsEndpoint: 'https://cdn.test/ingredients',
            isAuthorizedMediaDeliveryEnabled: true,
          },
        },
        'org-1',
        'asset-1',
        'images',
      ),
    ).resolves.toBe('https://signed.test/a');
    expect(authorizedMediaUrls.issueServerPublish).toHaveBeenCalledWith(
      'org-1',
      ['asset-1'],
    );
  });

  it('fails when delivery is on but no issuer or URL is available', async () => {
    const configService = {
      ingredientsEndpoint: 'https://cdn.test/ingredients',
      isAuthorizedMediaDeliveryEnabled: true,
    };

    await expect(
      resolveIngredientProcessingUrl(
        { configService },
        'org-1',
        'asset-1',
        'x',
      ),
    ).rejects.toThrow('Authorized media issuer is unavailable');
    await expect(
      resolveIngredientProcessingUrl(
        { authorizedMediaUrls: issuer(), configService },
        'org-1',
        'asset-1',
        'x',
      ),
    ).rejects.toThrow('The source has no authorized media URL');
  });
});

describe('resolveAssetProcessingUrl', () => {
  const filesClientService = {
    getPresignedDownloadUrl: vi.fn().mockResolvedValue('https://s3.test/key'),
    getPresignedDownloadUrlForObjectKey: vi
      .fn()
      .mockResolvedValue('https://s3.test/object'),
  };

  it('presigns the object key when there is one', async () => {
    await expect(
      resolveAssetProcessingUrl(
        {
          configService: {
            ingredientsEndpoint: '',
            isAuthorizedMediaDeliveryEnabled: false,
          },
          filesClientService,
        },
        'org-1',
        { ...ASSET, objectKey: 'object-1' },
      ),
    ).resolves.toBe('https://s3.test/object');
    expect(
      filesClientService.getPresignedDownloadUrlForObjectKey,
    ).toHaveBeenCalledWith('object-1');
  });

  it('presigns the storage key without an object key', async () => {
    await expect(
      resolveAssetProcessingUrl(
        {
          configService: {
            ingredientsEndpoint: '',
            isAuthorizedMediaDeliveryEnabled: false,
          },
          filesClientService,
        },
        'org-1',
        ASSET,
      ),
    ).resolves.toBe('https://s3.test/key');
    expect(filesClientService.getPresignedDownloadUrl).toHaveBeenCalledWith(
      'images/asset-1',
      'images',
    );
  });

  it('issues an authorized URL when delivery is on', async () => {
    await expect(
      resolveAssetProcessingUrl(
        {
          authorizedMediaUrls: issuer('https://signed.test/a'),
          configService: {
            ingredientsEndpoint: '',
            isAuthorizedMediaDeliveryEnabled: true,
          },
        },
        'org-1',
        ASSET,
      ),
    ).resolves.toBe('https://signed.test/a');
  });

  it('fails without storage access when delivery is off', async () => {
    await expect(resolveAssetProcessingUrl({}, 'org-1', ASSET)).rejects.toThrow(
      'File storage service is unavailable',
    );
  });
});
