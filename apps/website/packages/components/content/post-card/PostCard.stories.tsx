import { Platform, PostCategory, PostStatus } from '@genfeedai/enums';
import type { IPost } from '@genfeedai/interfaces';
import { Ingredient } from '@models/content/ingredient.model';
import { Post } from '@models/content/post.model';
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

const STORY_TIMESTAMP = '2024-01-15T00:00:00Z';

function createIngredient({
  id,
  metadataDuration,
  metadataLabel,
  thumbnailUrl,
}: {
  id: string;
  metadataDuration?: number;
  metadataLabel: string;
  thumbnailUrl?: string;
}) {
  return new Ingredient({
    id,
    metadataDuration,
    metadataLabel,
    thumbnailUrl,
  });
}

function createPost(partial: Partial<IPost>): IPost {
  return new Post({
    category: PostCategory.VIDEO,
    id: 'story-post',
    ingredients: [],
    platform: Platform.YOUTUBE,
    publicationDate: STORY_TIMESTAMP,
    status: PostStatus.DRAFT,
    uploadedAt: STORY_TIMESTAMP,
    ...partial,
  }) as IPost;
}

/**
 * Default post card with YouTube platform
 */
export const Default: Story = {
  args: {
    className: '',
    post: createPost({
      id: '1',
      ingredients: [
        createIngredient({
          id: '1',
          metadataDuration: 360,
          metadataLabel: 'Getting Started with React',
          thumbnailUrl:
            'https://via.placeholder.com/400x225/000000/FFFFFF?text=Video+Thumbnail',
        }),
      ],
      platform: Platform.YOUTUBE,
      publicationDate: '2024-01-16T00:00:00Z',
      status: PostStatus.PUBLIC,
      uploadedAt: '2024-01-15T00:00:00Z',
      url: 'https://youtube.com/watch?v=abc123',
    }),
  },
};

/**
 * Post card with scheduled status
 */
export const Scheduled: Story = {
  args: {
    className: '',
    post: createPost({
      id: '2',
      ingredients: [
        createIngredient({
          id: '2',
          metadataDuration: 120,
          metadataLabel: 'Building Modern UIs',
          thumbnailUrl:
            'https://via.placeholder.com/400x225/FF00FF/FFFFFF?text=Instagram+Post',
        }),
      ],
      platform: Platform.INSTAGRAM,
      scheduledDate: '2024-01-20T00:00:00Z',
      status: PostStatus.SCHEDULED,
      uploadedAt: '2024-01-14T00:00:00Z',
    }),
  },
};

/**
 * Post card with pending status
 */
export const Pending: Story = {
  args: {
    className: '',
    post: createPost({
      id: '3',
      ingredients: [
        createIngredient({
          id: '3',
          metadataDuration: 60,
          metadataLabel: 'Quick Tips for Developers',
          thumbnailUrl:
            'https://via.placeholder.com/400x225/000000/FFFFFF?text=TikTok+Video',
        }),
      ],
      platform: Platform.TIKTOK,
      status: PostStatus.DRAFT,
      uploadedAt: '2024-01-13T00:00:00Z',
    }),
  },
};

/**
 * Post card with failed status
 */
export const Failed: Story = {
  args: {
    className: '',
    post: createPost({
      id: '4',
      ingredients: [
        createIngredient({
          id: '4',
          metadataLabel: 'Twitter Video Post',
          thumbnailUrl:
            'https://via.placeholder.com/400x225/1DA1F2/FFFFFF?text=Twitter+Post',
        }),
      ],
      platform: Platform.TWITTER,
      status: PostStatus.FAILED,
      uploadedAt: '2024-01-12T00:00:00Z',
    }),
  },
};

/**
 * Post card with draft status
 */
export const Draft: Story = {
  args: {
    className: '',
    post: createPost({
      id: '5',
      ingredients: [
        createIngredient({
          id: '5',
          metadataLabel: 'Professional Development Tips',
          thumbnailUrl:
            'https://via.placeholder.com/400x225/0077B5/FFFFFF?text=LinkedIn+Post',
        }),
      ],
      platform: Platform.LINKEDIN,
      status: PostStatus.DRAFT,
    }),
  },
};

/**
 * Post card without thumbnail (shows play icon)
 */
export const NoThumbnail: Story = {
  args: {
    className: '',
    post: createPost({
      id: '6',
      ingredients: [
        createIngredient({
          id: '6',
          metadataLabel: 'Video Without Thumbnail',
        }),
      ],
      platform: Platform.FACEBOOK,
      publicationDate: '2024-01-11T00:00:00Z',
      status: PostStatus.PUBLIC,
      uploadedAt: '2024-01-11T00:00:00Z',
    }),
  },
};

/**
 * Multiple platform examples
 */
export const PlatformExamples: Story = {
  args: {},
  parameters: {
    layout: 'fullscreen',
  },
  render: () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-8 w-full max-w-7xl">
      <PostCard
        post={createPost({
          id: '1',
          ingredients: [
            createIngredient({
              id: '1',
              metadataDuration: 600,
              metadataLabel: 'YouTube Video',
              thumbnailUrl:
                'https://via.placeholder.com/400x225/FF0000/FFFFFF?text=YouTube',
            }),
          ],
          platform: Platform.YOUTUBE,
          publicationDate: '2024-01-16T00:00:00Z',
          status: PostStatus.PUBLIC,
          uploadedAt: '2024-01-15T00:00:00Z',
          url: 'https://youtube.com/watch?v=yt123',
        })}
      />
      <PostCard
        post={createPost({
          id: '2',
          ingredients: [
            createIngredient({
              id: '2',
              metadataDuration: 30,
              metadataLabel: 'Instagram Post',
              thumbnailUrl:
                'https://via.placeholder.com/400x225/E4405F/FFFFFF?text=Instagram',
            }),
          ],
          platform: Platform.INSTAGRAM,
          scheduledDate: '2024-01-20T00:00:00Z',
          status: PostStatus.SCHEDULED,
        })}
      />
      <PostCard
        post={createPost({
          id: '3',
          ingredients: [
            createIngredient({
              id: '3',
              metadataDuration: 45,
              metadataLabel: 'TikTok Video',
              thumbnailUrl:
                'https://via.placeholder.com/400x225/000000/FFFFFF?text=TikTok',
            }),
          ],
          platform: Platform.TIKTOK,
          publicationDate: '2024-01-14T00:00:00Z',
          status: PostStatus.PUBLIC,
        })}
      />
      <PostCard
        post={createPost({
          id: '4',
          ingredients: [
            createIngredient({
              id: '4',
              metadataLabel: 'Twitter Post',
              thumbnailUrl:
                'https://via.placeholder.com/400x225/1DA1F2/FFFFFF?text=Twitter',
            }),
          ],
          platform: Platform.TWITTER,
          status: PostStatus.DRAFT,
        })}
      />
      <PostCard
        post={createPost({
          id: '5',
          ingredients: [
            createIngredient({
              id: '5',
              metadataDuration: 180,
              metadataLabel: 'Facebook Video',
              thumbnailUrl:
                'https://via.placeholder.com/400x225/1877F2/FFFFFF?text=Facebook',
            }),
          ],
          platform: Platform.FACEBOOK,
          publicationDate: '2024-01-13T00:00:00Z',
          status: PostStatus.PUBLIC,
        })}
      />
      <PostCard
        post={createPost({
          id: '6',
          ingredients: [
            createIngredient({
              id: '6',
              metadataDuration: 240,
              metadataLabel: 'LinkedIn Post',
              thumbnailUrl:
                'https://via.placeholder.com/400x225/0077B5/FFFFFF?text=LinkedIn',
            }),
          ],
          platform: Platform.LINKEDIN,
          publicationDate: '2024-01-12T00:00:00Z',
          status: PostStatus.PUBLIC,
        })}
      />
    </div>
  ),
};
