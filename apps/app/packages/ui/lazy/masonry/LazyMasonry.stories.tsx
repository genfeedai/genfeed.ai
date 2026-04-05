import type { Meta, StoryObj } from '@storybook/nextjs';
import {
  LazyMasonryGrid,
  LazyMasonryImage,
  LazyMasonryVideo,
} from '@ui/lazy/masonry/LazyMasonry';

// LazyMasonryImage Stories
const imageMeta: Meta<typeof LazyMasonryImage> = {
  component: LazyMasonryImage,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Lazy/Masonry/LazyMasonryImage',
};

export default imageMeta;
type ImageStory = StoryObj<typeof LazyMasonryImage>;

export const ImageDefault: ImageStory = {
  args: {},
  name: 'Image - Default',
};

// LazyMasonryVideo Stories
export const VideoDefault: StoryObj<typeof LazyMasonryVideo> = {
  args: {},
  name: 'Video - Default',
  render: (args) => <LazyMasonryVideo {...args} />,
};

// LazyMasonryGrid Stories
export const GridDefault: StoryObj<typeof LazyMasonryGrid> = {
  args: {},
  name: 'Grid - Default',
  render: (args) => <LazyMasonryGrid {...args} />,
};
