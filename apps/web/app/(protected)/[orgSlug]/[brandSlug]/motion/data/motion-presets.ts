import { Captions, Hash, Quote } from 'lucide-react';
import type { MotionPreset } from '@/features/motion/props/motion-presets.props';

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
];
