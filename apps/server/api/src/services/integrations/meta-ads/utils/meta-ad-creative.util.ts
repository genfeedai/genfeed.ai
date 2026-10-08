import type { CreateAdCreativeInput } from '@api/services/integrations/meta-ads/interfaces/meta-ads.interface';

export function buildMetaAdCreative(creative: CreateAdCreativeInput): string {
  const linkData = {
    link: creative.linkUrl,
    ...(creative.title && { name: creative.title }),
    ...(creative.body && { message: creative.body }),
    ...(creative.imageHash && {
      image_hash: creative.imageHash,
    }),
    ...(creative.callToAction && {
      call_to_action: {
        type: creative.callToAction,
        value: { link: creative.linkUrl },
      },
    }),
  };
  const objectStorySpec: Record<string, unknown> = {
    page_id: creative.pageId ?? '',
  };

  if (creative.videoId) {
    objectStorySpec.video_data = {
      ...(creative.thumbnailUrl && {
        image_url: creative.thumbnailUrl,
      }),
      video_id: creative.videoId,
      ...(creative.title && { title: creative.title }),
      ...(creative.body && { message: creative.body }),
      ...(creative.callToAction && {
        call_to_action: {
          type: creative.callToAction,
          value: { link: creative.linkUrl },
        },
      }),
    };
  } else {
    objectStorySpec.link_data = linkData;
  }
  const creativeSpec = {
    object_story_spec: objectStorySpec,
    ...(creative.linkUrl
      ? {
          destination_spec: {
            destination_type: 'WEBSITE_AND_SHOP_OPT_OUT',
          },
        }
      : {}),
  };

  return JSON.stringify(creativeSpec);
}
