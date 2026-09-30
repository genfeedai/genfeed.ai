import type {
  BrandRemixRunView,
  BrandRemixStoryboardScene,
} from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import type { StoryboardAsset } from '@pages/studio/storyboard/hooks/use-storyboard-assets';

export function getStoryboardScenePreview(
  scene: BrandRemixStoryboardScene,
  pipeline: BrandRemixRunView['scenePipeline'],
  assets: Record<string, StoryboardAsset>,
) {
  const progress = scene.id ? pipeline?.scenes[scene.id] : undefined;
  const video =
    progress?.video.state === 'ready'
      ? assets[`video:${progress.video.assetId}`]
      : undefined;
  if (video?.cdnUrl)
    return { kind: 'video' as const, url: video.cdnUrl, isSourceFrame: false };
  const image =
    progress?.image.state === 'ready'
      ? assets[`image:${progress.image.assetId}`]
      : undefined;
  if (image?.cdnUrl)
    return { kind: 'image' as const, url: image.cdnUrl, isSourceFrame: false };
  const observation = scene.sourceObservation;
  if (
    !observation ||
    pipeline?.analysis?.sourceAssetId !== observation.sourceAssetId
  )
    return undefined;
  const frame = pipeline.analysis.keyframes.find(
    (item) => item.timestampSeconds === observation.keyframeSeconds,
  );
  const source = frame ? assets[`image:${frame.assetId}`] : undefined;
  return source?.cdnUrl
    ? { kind: 'image' as const, url: source.cdnUrl, isSourceFrame: true }
    : undefined;
}
