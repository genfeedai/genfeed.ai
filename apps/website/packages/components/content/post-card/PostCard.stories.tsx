import { Platform, PostCategory, PostStatus } from '@genfeedai/enums';
import type { ICredential, IIngredient, IPost } from '@genfeedai/interfaces';
import type { Meta, StoryObj } from '@storybook/nextjs';
import PostCard from '@web-components/content/post-card/PostCard';

function createCredential(
  externalId: string,
  externalUrl: string,
): ICredential {
  return {
    externalId,
    externalUrl,
  } as ICredential;
}

function createIngredient(
  id: string,
  metadataLabel: string,
  options?: {
    metadataDuration?: number;
    thumbnailUrl?: string;
  },
): IIngredient {
  return {
    id,
    metadataDuration: options?.metadataDuration,
    metadataLabel,
    thumbnailUrl: options?.thumbnailUrl,
  } as IIngredient;
}

function createPost(
  id: string,
  options: {
    credential?: ICredential;
    ingredients: IIngredient[];
    platform: Platform;
    publicationDate?: string;
    scheduledDate?: string;
    status: PostStatus;
    uploadedAt?: string;
  },
): IPost {
  return {
    category: PostCategory.VIDEO,
    credential: options.credential ?? ({} as ICredential),
    id,
    ingredients: options.ingredients,
    platform: options.platform,
    publicationDate: options.publicationDate ?? '2024-01-10T00:00:00Z',
    scheduledDate: options.scheduledDate,
    status: options.status,
    uploadedAt: options.uploadedAt ?? '2024-01-10T00:00:00Z',
  } as IPost;
}

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
    post: createPost('1', {
      credential: createCredential('abc123', 'https://youtube.com'),
      ingredients: [
        createIngredient('1', 'Getting Started with React', {
          metadataDuration: 360,
          thumbnailUrl:
            'https://via.placeholder.com/400x225/000000/FFFFFF?text=Video+Thumbnail',
        }),
      ],
      platform: Platform.YOUTUBE,
      publicationDate: '2024-01-16T00:00:00Z',
      status: PostStatus.PUBLIC,
      uploadedAt: '2024-01-15T00:00:00Z',
    }),
  },
};

/**
 * Post card with scheduled status
 */
export const Scheduled: Story = {
  args: {
    className: '',
    post: createPost('2', {
      ingredients: [
        createIngredient('2', 'Building Modern UIs', {
          metadataDuration: 120,
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
    post: createPost('3', {
      ingredients: [
        createIngredient('3', 'Quick Tips for Developers', {
          metadataDuration: 60,
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
    post: createPost('4', {
      ingredients: [
        createIngredient('4', 'Twitter Video Post', {
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
    post: createPost('5', {
      ingredients: [
        createIngredient('5', 'Professional Development Tips', {
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
    post: createPost('6', {
      ingredients: [createIngredient('6', 'Video Without Thumbnail')],
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
  parameters: {
    layout: 'fullscreen',
  },
  render: () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-8 w-full max-w-7xl">
      <PostCard
        post={createPost('1', {
          credential: createCredential('yt123', 'https://youtube.com'),
          ingredients: [
            createIngredient('1', 'YouTube Video', {
              metadataDuration: 600,
              thumbnailUrl:
                'https://via.placeholder.com/400x225/FF0000/FFFFFF?text=YouTube',
            }),
          ],
          platform: Platform.YOUTUBE,
          publicationDate: '2024-01-16T00:00:00Z',
          status: PostStatus.PUBLIC,
          uploadedAt: '2024-01-15T00:00:00Z',
        })}
      />
      <PostCard
        post={createPost('2', {
          ingredients: [
            createIngredient('2', 'Instagram Post', {
              metadataDuration: 30,
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
        post={createPost('3', {
          ingredients: [
            createIngredient('3', 'TikTok Video', {
              metadataDuration: 45,
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
        post={createPost('4', {
          ingredients: [
            createIngredient('4', 'Twitter Post', {
              thumbnailUrl:
                'https://via.placeholder.com/400x225/1DA1F2/FFFFFF?text=Twitter',
            }),
          ],
          platform: Platform.TWITTER,
          status: PostStatus.DRAFT,
        })}
      />
      <PostCard
        post={createPost('5', {
          ingredients: [
            createIngredient('5', 'Facebook Video', {
              metadataDuration: 180,
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
        post={createPost('6', {
          ingredients: [
            createIngredient('6', 'LinkedIn Post', {
              metadataDuration: 240,
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
