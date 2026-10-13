import { createLucideIcon } from 'lucide-react';

/** Lucide-style static icons Lucide does not ship; each has an animated twin. */
export const GalleryHorizontalStart = createLucideIcon(
  'GalleryHorizontalStart',
  [
    ['path', { d: 'M22 7v10', key: 'gallery-start-1' }],
    ['path', { d: 'M18 5v14', key: 'gallery-start-2' }],
    [
      'rect',
      {
        height: '18',
        key: 'gallery-start-3',
        rx: '2',
        width: '12',
        x: '2',
        y: '3',
      },
    ],
  ],
);

/** A social post: avatar and handle over the body text. */
export const PostCard = createLucideIcon('PostCard', [
  [
    'rect',
    { height: '18', key: 'post-1', rx: '2', width: '18', x: '3', y: '3' },
  ],
  ['circle', { cx: '8', cy: '8', key: 'post-2', r: '2' }],
  ['path', { d: 'M12.5 7h4.5', key: 'post-3' }],
  ['path', { d: 'M12.5 9.5h2.5', key: 'post-4' }],
  ['path', { d: 'M7 14h10', key: 'post-5' }],
  ['path', { d: 'M7 17h6', key: 'post-6' }],
]);
