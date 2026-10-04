import {
  classifyInternalMediaUrl,
  internalMediaHosts,
} from '@api/helpers/utils/reference/internal-media-url.util';

const hosts = internalMediaHosts([
  'https://cdn.genfeed.ai',
  'https://cdn.genfeed.ai/ingredients',
  'https://api.genfeed.ai',
  'https://files.genfeed.ai:8443',
]);

describe('classifyInternalMediaUrl (#6037)', () => {
  it.each([
    'https://cdn.genfeed.ai/ingredients/images/asset-1',
    'https://CDN.genfeed.ai/ingredients/images/asset-1',
    'https://cdn.genfeed.ai./ingredients/images/asset-1',
    'https://cdn.genfeed.ai/ingredients/%69mages/asset-1',
    'https://cdn.genfeed.ai/ingredients/%2569mages/asset-1',
    'https://cdn.genfeed.ai//ingredients///images//asset-1',
    'https://cdn.genfeed.ai/ingredients/images/asset-1?Signature=abc#frag',
    'https://api.genfeed.ai/images/asset-1',
    'https://API.GENFEED.AI/v1/videos/asset-1',
    'https://files.genfeed.ai:8443/images/asset-1',
    '/images/asset-1',
  ])('resolves %s to its asset id', (url) => {
    expect(classifyInternalMediaUrl(url, hosts)).toEqual({
      assetId: 'asset-1',
      isInternal: true,
    });
  });

  it('treats any internal-host URL as internal and unresolvable ones fail closed', () => {
    for (const url of [
      'https://cdn.genfeed.ai/ingredients/not-media/asset-1',
      'https://CDN.genfeed.ai/ingredients/images/',
      'https://cdn.genfeed.ai/ingredients/%E0%A4%A',
    ]) {
      expect(classifyInternalMediaUrl(url, hosts)).toEqual({
        isInternal: true,
      });
    }
  });

  it('leaves external URLs and bare ids alone', () => {
    expect(
      classifyInternalMediaUrl('https://example.com/images/asset-1', hosts),
    ).toEqual({ isInternal: false });
    expect(classifyInternalMediaUrl('asset-1', hosts)).toEqual({
      isInternal: false,
    });
  });
});
