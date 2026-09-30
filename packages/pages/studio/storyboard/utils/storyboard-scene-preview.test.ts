import type {
  BrandRemixRunView,
  BrandRemixStoryboardScene,
} from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import { Image } from '@genfeedai/models/ingredients/image.model';
import { Video } from '@genfeedai/models/ingredients/video.model';
import { describe, expect, it } from 'vitest';
import { getStoryboardScenePreview } from './storyboard-scene-preview';

const scene: BrandRemixStoryboardScene = {
  id: 'shot',
  ordinal: 1,
  visualIntent: 'Product',
  sourceObservation: {
    sourceAssetId: 'source',
    startSeconds: 0,
    endSeconds: 5,
    keyframeSeconds: 2,
    semanticIntent: 'Product',
    transcriptSlice: '',
  },
};
const pipeline = {
  scenes: {
    shot: {
      video: { state: 'ready', assetId: 'video' },
      image: { state: 'ready', assetId: 'image' },
    },
  },
  analysis: {
    sourceAssetId: 'source',
    keyframes: [{ assetId: 'frame', timestampSeconds: 2 }],
  },
} as unknown as NonNullable<BrandRemixRunView['scenePipeline']>;
const assets = {
  'video:video': new Video({
    id: 'video',
    cdnUrl: 'https://cdn.test/video.mp4',
  }),
  'image:image': new Image({
    id: 'image',
    cdnUrl: 'https://cdn.test/image.png',
  }),
  'image:frame': new Image({
    id: 'frame',
    cdnUrl: 'https://cdn.test/frame.png',
  }),
};
describe('scene preview provenance', () => {
  it('prefers a ready video, then image, then exact recorded source frame', () => {
    expect(getStoryboardScenePreview(scene, pipeline, assets)).toMatchObject({
      kind: 'video',
      url: assets['video:video'].cdnUrl,
      isSourceFrame: false,
    });
    expect(
      getStoryboardScenePreview(scene, pipeline, {
        'image:image': assets['image:image'],
      }),
    ).toMatchObject({ kind: 'image', isSourceFrame: false });
    expect(
      getStoryboardScenePreview(scene, pipeline, {
        'image:frame': assets['image:frame'],
      }),
    ).toMatchObject({ url: assets['image:frame'].cdnUrl, isSourceFrame: true });
  });
  it('never substitutes a nearby timestamp, another source or unfinished media', () => {
    expect(
      getStoryboardScenePreview(
        {
          ...scene,
          sourceObservation: {
            ...{
              sourceAssetId: 'source',
              startSeconds: 0,
              endSeconds: 5,
              keyframeSeconds: 2,
              semanticIntent: 'Product',
              transcriptSlice: '',
            },
            keyframeSeconds: 2.01,
          },
        },
        pipeline,
        { 'image:frame': assets['image:frame'] },
      ),
    ).toBeUndefined();
    expect(
      getStoryboardScenePreview(
        {
          ...scene,
          sourceObservation: {
            ...{
              sourceAssetId: 'source',
              startSeconds: 0,
              endSeconds: 5,
              keyframeSeconds: 2,
              semanticIntent: 'Product',
              transcriptSlice: '',
            },
            sourceAssetId: 'other',
          },
        },
        pipeline,
        { 'image:frame': assets['image:frame'] },
      ),
    ).toBeUndefined();
    expect(
      getStoryboardScenePreview(
        { ...scene, sourceObservation: undefined },
        {
          ...pipeline,
          scenes: {
            shot: {
              ...pipeline.scenes.shot,
              video: { attempt: 1, state: 'submitted', assetId: 'video' },
              image: { attempt: 1, state: 'failed', assetId: 'image' },
            },
          },
        },
        assets,
      ),
    ).toBeUndefined();
  });
});
