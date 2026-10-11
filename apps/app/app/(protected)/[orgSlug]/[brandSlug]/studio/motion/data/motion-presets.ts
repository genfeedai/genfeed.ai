import type { MotionPreset } from '@genfeedai/props/studio/motion-presets.props';
import {
  BarChart3,
  Captions,
  Hash,
  LayoutList,
  Quote,
  Sparkles,
} from 'lucide-react';

/**
 * Brand-neutral compose-form starting points for Motion. Prompts are content
 * sent to the author model, so they stay here; titles and descriptions are
 * i18n under `pages.studioMotion.presets.items.<id>`. Dimensions respect the
 * renderer limits (256 to 1920 px, 1920x1080 pixels, 900 frames at 30 fps).
 */
export const MOTION_PRESETS: readonly MotionPreset[] = [
  {
    durationFrames: 300,
    height: 1920,
    icon: Quote,
    id: 'kineticQuote',
    prompt:
      'A vertical kinetic typography animation. A short, punchy quote appears word by word on a bold solid background, and the key word scales up and changes color as it lands. Use smooth ease-in-out motion, generous safe margins and a clean sans-serif typeface. End on a quiet hold of the full quote.',
    width: 1080,
  },
  {
    durationFrames: 240,
    height: 1080,
    icon: Hash,
    id: 'statCounter',
    prompt:
      'A square animated statistic. Count a large headline number from zero up to its final value with an easing curve, show a short label beneath it and fill a thin progress bar in step with the count. Finish with a subtle pulse on the number and a one-line caption fading in.',
    width: 1080,
  },
  {
    durationFrames: 150,
    height: 1080,
    icon: Captions,
    id: 'lowerThird',
    prompt:
      'A broadcast-style lower third for a landscape video. A name and a job title slide in from the left over a semi-transparent bar with a thin accent line, hold for two seconds and slide back out. Keep everything inside the lower safe area and leave the rest of the frame empty.',
    width: 1920,
  },
  {
    durationFrames: 360,
    height: 1920,
    icon: LayoutList,
    id: 'featureCallouts',
    prompt:
      'A vertical feature callout reel. Three feature cards enter one after another, each with a simple icon, a short title and a one-line benefit. Highlight the active card, dim the others, and close on a call-to-action button that scales in with a gentle bounce.',
    width: 1080,
  },
  {
    durationFrames: 120,
    height: 1080,
    icon: Sparkles,
    id: 'logoReveal',
    prompt:
      'A short logo reveal for a landscape video. Simple geometric shapes sweep across a clean background and settle into a placeholder wordmark, followed by a light shimmer and a soft tagline fading in beneath. Use one accent color and keep the motion crisp.',
    width: 1920,
  },
  {
    durationFrames: 360,
    height: 1080,
    icon: BarChart3,
    id: 'barChart',
    prompt:
      'An animated horizontal bar chart with five categories. Bars grow from zero in sequence with staggered easing, values count up beside each bar, and the leading bar is highlighted at the end. Add a clear title at the top and a small source line at the bottom.',
    width: 1920,
  },
];
