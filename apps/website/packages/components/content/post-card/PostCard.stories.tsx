import { Platform, PostCategory, PostStatus } from '@genfeedai/enums';
import type { Meta, StoryObj } from '@storybook/nextjs';
import PostCard from '@web-components/content/post-card/PostCard';

/**
 * PostCard component displays a publication/post with platform information,
 * status, dates, and action buttons.
 */
const meta = {
  argTypes: {
    className: {
      control: 'text',
      description: 'Additional CSS classes',
    },
    post: {
      control: 'object',
      description:
        'Publication/post object with platform, status, dates, and ingredient data',
    },
  },
  component: PostCard,
  parameters: {
    docs: {
      description: {
        component:
          'Card component for displaying post/publication information with platform icons, status badges, and action links.',
      },
    },
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Content/PostCard',
} satisfies Meta<typeof PostCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default post card with YouTube platform
 */
export const Default: Story = {
  args: {
    className: '',
    post: {
      category: PostCategory.VIDEO,
      credential: {
        externalId: 'abc123',
        externalUrl: 'https://youtube.com',
      } as any,
      id: '1',
      ingredients: [
        {
          id: '1',
          metadataDuration: 360,
          metadataLabel: 'Getting Started with React',
          thumbnailUrl:
            'https://via.placeholder.com/400x225/000000/FFFFFF?text=Video+Thumbnail',
        },
      ] as any,
      platform: Platform.YOUTUBE,
      publicationDate: '2024-01-16T00:00:00Z',
      status: PostStatus.PUBLIC,
      uploadedAt: '2024-01-15T00:00:00Z',
    } as any,
  },
};

/**
 * Post card with scheduled status
 */
export const Scheduled: Story = {
  args: {
    className: '',
    post: {
      category: PostCategory.VIDEO,
      id: '2',
      ingredients: [
        {
          id: '2',
          metadataDuration: 120,
          metadataLabel: 'Building Modern UIs',
          thumbnailUrl:
            'https://via.placeholder.com/400x225/FF00FF/FFFFFF?text=Instagram+Post',
        },
      ] as any,
      platform: Platform.INSTAGRAM,
      scheduledDate: '2024-01-20T00:00:00Z',
      status: PostStatus.SCHEDULED,
      uploadedAt: '2024-01-14T00:00:00Z',
    } as any,
  },
};

/**
 * Post card with pending status
 */
export const Pending: Story = {
  args: {
    className: '',
    post: {
      category: PostCategory.VIDEO,
      id: '3',
      ingredients: [
        {
          id: '3',
          metadataDuration: 60,
          metadataLabel: 'Quick Tips for Developers',
          thumbnailUrl:
            'https://via.placeholder.com/400x225/000000/FFFFFF?text=TikTok+Video',
        },
      ] as any,
      platform: Platform.TIKTOK,
      status: PostStatus.DRAFT,
      uploadedAt: '2024-01-13T00:00:00Z',
    } as any,
  },
};

/**
 * Post card with failed status
 */
export const Failed: Story = {
  args: {
    className: '',
    post: {
      category: PostCategory.VIDEO,
      id: '4',
      ingredients: [
        {
          id: '4',
          metadataLabel: 'Twitter Video Post',
          thumbnailUrl:
            'https://via.placeholder.com/400x225/1DA1F2/FFFFFF?text=Twitter+Post',
        },
      ] as any,
      platform: Platform.TWITTER,
      status: PostStatus.FAILED,
      uploadedAt: '2024-01-12T00:00:00Z',
    } as any,
  },
};

/**
 * Post card with draft status
 */
export const Draft: Story = {
  args: {
    className: '',
    post: {
      category: PostCategory.VIDEO,
      id: '5',
      ingredients: [
        {
          id: '5',
          metadataLabel: 'Professional Development Tips',
          thumbnailUrl:
            'https://via.placeholder.com/400x225/0077B5/FFFFFF?text=LinkedIn+Post',
        },
      ] as any,
      platform: Platform.LINKEDIN,
      status: PostStatus.DRAFT,
    } as any,
  },
};

/**
 * Post card without thumbnail (shows play icon)
 */
export const NoThumbnail: Story = {
  args: {
    className: '',
    post: {
      category: PostCategory.VIDEO,
      id: '6',
      ingredients: [
        {
          id: '6',
          metadataLabel: 'Video Without Thumbnail',
        },
      ] as any,
      platform: Platform.FACEBOOK,
      publicationDate: '2024-01-11T00:00:00Z',
      status: PostStatus.PUBLIC,
      uploadedAt: '2024-01-11T00:00:00Z',
    } as any,
  },
};

/**
 * Multiple platform examples
 */
export const PlatformExamples: Story = {
  args: {} as any,
  parameters: {
    layout: 'fullscreen',
  },
  render: () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-8 w-full max-w-7xl">
      <PostCard
        post={
          {
            category: PostCategory.VIDEO,
            credential: {
              externalId: 'yt123',
              externalUrl: 'https://youtube.com',
            } as any,
            id: '1',
            ingredients: [
              {
                id: '1',
                metadataDuration: 600,
                metadataLabel: 'YouTube Video',
                thumbnailUrl:
                  'https://via.placeholder.com/400x225/FF0000/FFFFFF?text=YouTube',
              },
            ] as any,
            platform: Platform.YOUTUBE,
            publicationDate: '2024-01-16T00:00:00Z',
            status: PostStatus.PUBLIC,
            uploadedAt: '2024-01-15T00:00:00Z',
          } as any
        }
      />
      <PostCard
        post={
          {
            category: PostCategory.VIDEO,
            id: '2',
            ingredients: [
              {
                id: '2',
                metadataDuration: 30,
                metadataLabel: 'Instagram Post',
                thumbnailUrl:
                  'https://via.placeholder.com/400x225/E4405F/FFFFFF?text=Instagram',
              },
            ] as any,
            platform: Platform.INSTAGRAM,
            scheduledDate: '2024-01-20T00:00:00Z',
            status: PostStatus.SCHEDULED,
          } as any
        }
      />
      <PostCard
        post={
          {
            category: PostCategory.VIDEO,
            id: '3',
            ingredients: [
              {
                id: '3',
                metadataDuration: 45,
                metadataLabel: 'TikTok Video',
                thumbnailUrl:
                  'https://via.placeholder.com/400x225/000000/FFFFFF?text=TikTok',
              },
            ] as any,
            platform: Platform.TIKTOK,
            publicationDate: '2024-01-14T00:00:00Z',
            status: PostStatus.PUBLIC,
          } as any
        }
      />
      <PostCard
        post={
          {
            category: PostCategory.VIDEO,
            id: '4',
            ingredients: [
              {
                id: '4',
                metadataLabel: 'Twitter Post',
                thumbnailUrl:
                  'https://via.placeholder.com/400x225/1DA1F2/FFFFFF?text=Twitter',
              },
            ] as any,
            platform: Platform.TWITTER,
            status: PostStatus.DRAFT,
          } as any
        }
      />
      <PostCard
        post={
          {
            category: PostCategory.VIDEO,
            id: '5',
            ingredients: [
              {
                id: '5',
                metadataDuration: 180,
                metadataLabel: 'Facebook Video',
                thumbnailUrl:
                  'https://via.placeholder.com/400x225/1877F2/FFFFFF?text=Facebook',
              },
            ] as any,
            platform: Platform.FACEBOOK,
            publicationDate: '2024-01-13T00:00:00Z',
            status: PostStatus.PUBLIC,
          } as any
        }
      />
      <PostCard
        post={
          {
            category: PostCategory.VIDEO,
            id: '6',
            ingredients: [
              {
                id: '6',
                metadataDuration: 240,
                metadataLabel: 'LinkedIn Post',
                thumbnailUrl:
                  'https://via.placeholder.com/400x225/0077B5/FFFFFF?text=LinkedIn',
              },
            ] as any,
            platform: Platform.LINKEDIN,
            publicationDate: '2024-01-12T00:00:00Z',
            status: PostStatus.PUBLIC,
          } as any
        }
      />
    </div>
  ),
};
