import { WorkflowTemplateCategory, type WorkflowTemplate } from '@genfeedai/types';
import { CAM_PROFILE_PROMO_TEMPLATE } from './cam-profile-promo';
import { CASINO_PROMO_CLIP_TEMPLATE } from './casino-promo-clip';
import { FULL_PIPELINE_TEMPLATE } from './full-pipeline';
import { AI_INFLUENCER_AVATAR_TEMPLATE } from './generated/ai-influencer-avatar';
import { DANCE_VIDEO_TEMPLATE } from './generated/dance-video';
import { EXTENDED_VIDEO_TEMPLATE } from './generated/extended-video';
import { FACECAM_AVATAR_TEMPLATE } from './generated/facecam-avatar';
import { GRID_TO_VIDEO_TEMPLATE } from './generated/grid-to-video';
import { INSTAGRAM_CAROUSEL_TEMPLATE } from './generated/instagram-carousel';
import { SOCIAL_BRAND_KIT_TEMPLATE } from './generated/social-brand-kit';
import { STREAM_TO_SOCIAL_TEMPLATE } from './generated/stream-to-social';
import { VOICE_TO_VIDEO_TEMPLATE } from './generated/voice-to-video';
import { YOUTUBE_THUMBNAIL_SCRIPT_TEMPLATE } from './generated/youtube-thumbnail-script';
import { YOUTUBE_VIDEO_GENERATOR_TEMPLATE } from './generated/youtube-video-generator';
import { IMAGE_SERIES_TEMPLATE } from './image-series';
import { IMAGE_TO_VIDEO_TEMPLATE } from './image-to-video';
import { JACKPOT_HIGHLIGHT_TEMPLATE } from './jackpot-highlight';
import { SOCIAL_TEASER_CLIP_TEMPLATE } from './social-teaser-clip';
import { SPORTS_BETTING_TEASER_TEMPLATE } from './sports-betting-teaser';
import { STREAMER_HIGHLIGHT_REEL_TEMPLATE } from './streamer-highlight-reel';
import { STYLE_TRANSFER_TEMPLATE } from './style-transfer';
import { CHARACTER_VARIATIONS_TEMPLATE } from './character-variations';
import { IMAGE_REMIX_TEMPLATE } from './image-remix';
import { UGC_FACTORY_TEMPLATE } from './ugc-factory';

export interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  category: WorkflowTemplateCategory;
  thumbnail?: string;
}

export const TEMPLATE_REGISTRY: Record<string, WorkflowTemplate> = {
  'ai-influencer-avatar': AI_INFLUENCER_AVATAR_TEMPLATE,
  'cam-profile-promo': CAM_PROFILE_PROMO_TEMPLATE,
  'casino-promo-clip': CASINO_PROMO_CLIP_TEMPLATE,
  'character-variations': CHARACTER_VARIATIONS_TEMPLATE,
  'dance-video': DANCE_VIDEO_TEMPLATE,
  'extended-video': EXTENDED_VIDEO_TEMPLATE,
  'facecam-avatar': FACECAM_AVATAR_TEMPLATE,
  'full-pipeline': FULL_PIPELINE_TEMPLATE,
  'grid-to-video': GRID_TO_VIDEO_TEMPLATE,
  'image-remix': IMAGE_REMIX_TEMPLATE,
  'image-series': IMAGE_SERIES_TEMPLATE,
  'image-to-video': IMAGE_TO_VIDEO_TEMPLATE,
  'instagram-carousel': INSTAGRAM_CAROUSEL_TEMPLATE,
  'jackpot-highlight': JACKPOT_HIGHLIGHT_TEMPLATE,
  'social-brand-kit': SOCIAL_BRAND_KIT_TEMPLATE,
  'social-teaser-clip': SOCIAL_TEASER_CLIP_TEMPLATE,
  'sports-betting-teaser': SPORTS_BETTING_TEASER_TEMPLATE,
  'stream-to-social': STREAM_TO_SOCIAL_TEMPLATE,
  'streamer-highlight-reel': STREAMER_HIGHLIGHT_REEL_TEMPLATE,
  'style-transfer': STYLE_TRANSFER_TEMPLATE,
  'ugc-factory': UGC_FACTORY_TEMPLATE,
  'voice-to-video': VOICE_TO_VIDEO_TEMPLATE,
  'youtube-thumbnail-script': YOUTUBE_THUMBNAIL_SCRIPT_TEMPLATE,
  'youtube-video-generator': YOUTUBE_VIDEO_GENERATOR_TEMPLATE,
};

export const TEMPLATE_INFO: TemplateInfo[] = [
  {
    category: WorkflowTemplateCategory.IMAGE,
    description: 'Generate a series of related images from a concept prompt using LLM expansion',
    id: 'image-series',
    name: 'Image Series',
    thumbnail: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=600&h=400&fit=crop',
  },
  {
    category: WorkflowTemplateCategory.VIDEO,
    description: 'Create interpolated video between two images with easing animation',
    id: 'image-to-video',
    name: 'Image to Video',
    thumbnail: 'https://images.unsplash.com/photo-1536240478700-b869070f9279?w=600&h=400&fit=crop',
  },
  {
    category: WorkflowTemplateCategory.FULL_PIPELINE,
    description: 'Complete workflow: concept → images → videos → animation → stitched output',
    id: 'full-pipeline',
    name: 'Full Content Pipeline',
    thumbnail: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&h=400&fit=crop',
  },
  {
    category: WorkflowTemplateCategory.VIDEO,
    description:
      'Generate longer videos by chaining segments: extract last frame, generate continuation prompt, create next segment, and stitch together',
    id: 'extended-video',
    name: 'Extended Video Pipeline',
    thumbnail: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=600&h=400&fit=crop',
  },
  {
    category: WorkflowTemplateCategory.FULL_PIPELINE,
    description:
      'Generate a 3x3 grid image, split into 9 cells, create video from each, apply easing, and stitch into final video',
    id: 'grid-to-video',
    name: 'Grid to Video Pipeline',
    thumbnail: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&h=400&fit=crop',
  },
  {
    category: WorkflowTemplateCategory.AUDIO,
    description: 'Generate a talking-head video from an image and audio file using lip-sync AI',
    id: 'voice-to-video',
    name: 'Voice to Video',
    thumbnail: 'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=600&h=400&fit=crop',
  },
  {
    category: WorkflowTemplateCategory.IMAGE,
    description:
      'Generate multiple thumbnail variations using character and reference images, plus a livestream script from topic context',
    id: 'youtube-thumbnail-script',
    name: 'YouTube Thumbnail & Script',
    thumbnail: 'https://images.unsplash.com/photo-1611162616475-46b635cb6868?w=600&h=400&fit=crop',
  },
  {
    category: WorkflowTemplateCategory.FULL_PIPELINE,
    description:
      'Generate a complete 10-minute YouTube video: script → images → videos with camera movements → stitch → music → subtitles',
    id: 'youtube-video-generator',
    name: 'YouTube 10-Min Video Generator',
    thumbnail: 'https://images.unsplash.com/photo-1492619375914-88005aa9e8fb?w=600&h=400&fit=crop',
  },
  {
    category: WorkflowTemplateCategory.FULL_PIPELINE,
    description:
      'Transform a 1-hour stream into short-form content: transcribe → extract hot takes → generate intro + trim highlights → export',
    id: 'stream-to-social',
    name: 'Stream to Short-Form Content',
    thumbnail: 'https://images.unsplash.com/photo-1614680376593-902f74cf0d41?w=600&h=400&fit=crop',
  },
  {
    category: WorkflowTemplateCategory.IMAGE,
    description:
      'Generate a complete brand kit: profile picture, YouTube banner, Facebook cover, and X header with automatic platform resizing',
    id: 'social-brand-kit',
    name: 'Social Media Brand Kit',
    thumbnail: 'https://images.unsplash.com/photo-1611162618071-b39a2ec055fb?w=600&h=400&fit=crop',
  },
  {
    category: WorkflowTemplateCategory.VIDEO,
    description:
      'Generate talking head videos from text scripts using ElevenLabs TTS and lip sync AI',
    id: 'facecam-avatar',
    name: 'Facecam Avatar',
    thumbnail: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&h=400&fit=crop',
  },
  {
    category: WorkflowTemplateCategory.VIDEO,
    description:
      'Apply dance or motion from a reference video to a static image using Kling v2.6 motion control',
    id: 'dance-video',
    name: 'Dance Video',
    thumbnail: 'https://images.unsplash.com/photo-1508700929628-666bc8bd84ea?w=600&h=400&fit=crop',
  },
  {
    category: WorkflowTemplateCategory.IMAGE,
    description:
      'Generate 3 pose variations of a subject from a single reference image for carousel posts',
    id: 'instagram-carousel',
    name: 'Instagram Carousel',
    thumbnail: 'https://images.unsplash.com/photo-1611262588024-d12430b98920?w=600&h=400&fit=crop',
  },
  {
    category: WorkflowTemplateCategory.IMAGE,
    description:
      'Generate a consistent AI influencer avatar and create multiple scene/pose variations for social media content',
    id: 'ai-influencer-avatar',
    name: 'AI Influencer Avatar',
    thumbnail: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&h=400&fit=crop',
  },
  {
    category: WorkflowTemplateCategory.VIDEO,
    description:
      'Short-form promo video from a concept: expand into visual scenes, generate imagery, animate, stitch with CTA voiceover',
    id: 'casino-promo-clip',
    name: 'Casino Promo Clip',
    thumbnail: 'https://images.unsplash.com/photo-1596838132731-3301c3fd4317?w=600&h=400&fit=crop',
  },
  {
    category: WorkflowTemplateCategory.VIDEO,
    description:
      'Hype clip for sports betting events: dramatic scenes with fast cuts and bold odds overlay',
    id: 'sports-betting-teaser',
    name: 'Sports Betting Teaser',
    thumbnail: 'https://images.unsplash.com/photo-1461896836934-bd45ba8a0326?w=600&h=400&fit=crop',
  },
  {
    category: WorkflowTemplateCategory.VIDEO,
    description:
      'Big win celebration clip: hero visual, zoom/pan animation, winner amount overlay with excitement voiceover',
    id: 'jackpot-highlight',
    name: 'Jackpot Highlight',
    thumbnail: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=600&h=400&fit=crop',
  },
  {
    category: WorkflowTemplateCategory.VIDEO,
    description:
      'Repurpose stream footage into social-ready clips with captions and 9:16 resize for TikTok/Reels',
    id: 'streamer-highlight-reel',
    name: 'Streamer Highlight Reel',
    thumbnail: 'https://images.unsplash.com/photo-1614680376593-902f74cf0d41?w=600&h=400&fit=crop',
  },
  {
    category: WorkflowTemplateCategory.VIDEO,
    description:
      'Auto-generate profile promo video from photos with cinematic motion, crossfade, and handle overlay',
    id: 'cam-profile-promo',
    name: 'Cam Profile Promo',
    thumbnail: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=600&h=400&fit=crop',
  },
  {
    category: WorkflowTemplateCategory.VIDEO,
    description:
      'Quick teaser clip for Twitter/Instagram: animate a photo, upscale quality, add bold CTA overlay',
    id: 'social-teaser-clip',
    name: 'Social Teaser Clip',
    thumbnail: 'https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?w=600&h=400&fit=crop',
  },
  {
    category: WorkflowTemplateCategory.IMAGE,
    description: 'Apply a new style to your reference image while preserving the subject identity',
    id: 'style-transfer',
    name: 'Style Transfer',
    thumbnail: 'https://images.unsplash.com/photo-1547891654-e66ed7ebb968?w=600&h=400&fit=crop',
  },
  {
    category: WorkflowTemplateCategory.IMAGE,
    description:
      'Generate multiple scenes with a consistent character from a single reference photo',
    id: 'character-variations',
    name: 'Character Variations',
    thumbnail: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&h=400&fit=crop',
  },
  {
    category: WorkflowTemplateCategory.IMAGE,
    description: 'Reimagine your image in a new style while keeping the overall composition',
    id: 'image-remix',
    name: 'Image Remix',
    thumbnail: 'https://images.unsplash.com/photo-1549490349-8643362247b5?w=600&h=400&fit=crop',
  },
  {
    category: WorkflowTemplateCategory.VIDEO,
    description: 'Create AI-powered UGC videos: script → voice → motion → lip sync',
    id: 'ugc-factory',
    name: 'UGC Factory',
  },
];

export function getTemplate(id: string): WorkflowTemplate | undefined {
  return TEMPLATE_REGISTRY[id];
}

export function getTemplatesByCategory(category: string): TemplateInfo[] {
  if (category === 'all') return TEMPLATE_INFO;
  return TEMPLATE_INFO.filter((t) => t.category === category);
}

export {
  IMAGE_SERIES_TEMPLATE,
  IMAGE_TO_VIDEO_TEMPLATE,
  FULL_PIPELINE_TEMPLATE,
  EXTENDED_VIDEO_TEMPLATE,
  GRID_TO_VIDEO_TEMPLATE,
  VOICE_TO_VIDEO_TEMPLATE,
  YOUTUBE_THUMBNAIL_SCRIPT_TEMPLATE,
  YOUTUBE_VIDEO_GENERATOR_TEMPLATE,
  STREAM_TO_SOCIAL_TEMPLATE,
  SOCIAL_BRAND_KIT_TEMPLATE,
  FACECAM_AVATAR_TEMPLATE,
  DANCE_VIDEO_TEMPLATE,
  INSTAGRAM_CAROUSEL_TEMPLATE,
  AI_INFLUENCER_AVATAR_TEMPLATE,
  CASINO_PROMO_CLIP_TEMPLATE,
  SPORTS_BETTING_TEASER_TEMPLATE,
  JACKPOT_HIGHLIGHT_TEMPLATE,
  STREAMER_HIGHLIGHT_REEL_TEMPLATE,
  CAM_PROFILE_PROMO_TEMPLATE,
  SOCIAL_TEASER_CLIP_TEMPLATE,
  STYLE_TRANSFER_TEMPLATE,
  CHARACTER_VARIATIONS_TEMPLATE,
  IMAGE_REMIX_TEMPLATE,
  UGC_FACTORY_TEMPLATE,
};
