import { cva } from 'class-variance-authority';

/**
 * Avatar frame. One size scale and two shapes serve every person, account,
 * brand, organization and company picture, so call sites pick `size` and
 * `shape` instead of restyling with classes. Text size follows the frame so
 * the initials always fit.
 *
 * `fill` takes the width of its parent and leaves the height to an `aspect-*`
 * class, for picture tiles in a grid.
 */
export const avatarVariants = cva(
  'group relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden bg-muted font-semibold text-foreground/80',
  {
    compoundVariants: [
      { class: 'rounded-sm', shape: 'square', size: '2xs' },
      { class: 'rounded-md', shape: 'square', size: ['xs', 'sm', 'md', 'lg'] },
      { class: 'rounded-xl', shape: 'square', size: ['xl', '2xl', '3xl'] },
      { class: 'rounded-md', shape: 'square', size: 'fill' },
    ],
    defaultVariants: {
      shape: 'circle',
      size: 'lg',
    },
    variants: {
      shape: {
        circle: 'rounded-full',
        square: '',
      },
      size: {
        '2xl': 'size-24 text-3xl',
        '2xs': 'size-4 text-2xs',
        '3xl': 'size-32 text-4xl',
        fill: 'h-auto w-full text-2xl',
        lg: 'size-10 text-sm',
        md: 'size-8 text-xs',
        sm: 'size-6 text-2xs',
        xl: 'size-14 text-lg',
        xs: 'size-5 text-2xs',
      },
    },
  },
);

/**
 * Corner badge, sized from the avatar it sits on. The ring cuts the badge out
 * of the picture; whatever is passed in (a platform badge, an icon) is
 * stretched to the slot, so callers never size it.
 */
export const avatarBadgeVariants = cva(
  'absolute flex items-center justify-center overflow-hidden rounded-full bg-background ring-2 ring-background [&>*]:size-full [&>*]:justify-center [&>*]:rounded-full [&>*]:p-0',
  {
    defaultVariants: {
      size: 'lg',
    },
    variants: {
      size: {
        '2xl': '-bottom-0.5 -right-0.5 size-7 [&_svg]:size-4',
        '2xs': '-bottom-0.5 -right-0.5 size-2 [&_svg]:size-1.5',
        '3xl': '-bottom-0.5 -right-0.5 size-9 [&_svg]:size-5',
        fill: '-bottom-0.5 -right-0.5 size-5 [&_svg]:size-3',
        lg: '-bottom-0.5 -right-0.5 size-4.5 [&_svg]:size-3',
        md: '-bottom-0.5 -right-0.5 size-4 [&_svg]:size-2.5',
        sm: '-bottom-0.5 -right-0.5 size-3.5 [&_svg]:size-2',
        xl: '-bottom-0.5 -right-0.5 size-5 [&_svg]:size-3',
        xs: '-bottom-0.5 -right-0.5 size-3 [&_svg]:size-2',
      },
    },
  },
);
