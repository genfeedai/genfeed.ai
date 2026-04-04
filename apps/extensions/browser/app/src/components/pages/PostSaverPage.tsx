import { Storage } from '@plasmohq/storage';
import { useEffect, useState } from 'react';
import {
  CloseIcon,
  CreateIcon,
  EmptyState,
  LoadingPage,
  PostsIcon,
  ReplyIcon,
  ViewIcon,
} from '~components/ui';
import { logger } from '~utils/logger.util';

const storage = new Storage();

interface SavedPost {
  id: string;
  postId: string;
  url: string;
  content?: string;
  author?: string;
  savedAt: string;
}

export default function PostSaverPage() {
  const [savedPosts, setSavedPosts] = useState<SavedPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadSavedPosts(): Promise<void> {
      setIsLoading(true);
      try {
        const posts = (await storage.get('saved_posts')) as SavedPost[] | null;
        setSavedPosts(posts || []);
      } catch (error) {
        logger.error('Error loading posts', error);
      }
      setIsLoading(false);
    }

    loadSavedPosts();
  }, []);

  async function removePost(id: string): Promise<void> {
    const updatedPosts = savedPosts.filter((post) => post.id !== id);
    await storage.set('saved_posts', updatedPosts);
    setSavedPosts(updatedPosts);
  }

  function saveToBookmarks(post: SavedPost): void {
    chrome.runtime.sendMessage(
      {
        data: {
          author: post.author,
          authorHandle: post.author,
          content: post.content || '',
          intent: 'video',
          platform: 'twitter',
          platformData: { tweetId: post.postId },
          type: 'tweet',
          url: post.url,
        },
        event: 'saveBookmark',
      },
      (response) => {
        if (response?.success) {
          alert('Saved to bookmarks! You can now generate a video.');
        } else {
          alert(
            `Failed to save bookmark: ${response?.error || 'Unknown error'}`,
          );
        }
      },
    );
  }

  function createVideoFromPost(post: SavedPost): void {
    saveToBookmarks(post);
    chrome.runtime.sendMessage({
      data: { content: post.content, source: 'post', url: post.url },
      event: 'navigateToPrompt',
    });
  }

  function generateReply(post: SavedPost): void {
    chrome.runtime.sendMessage(
      {
        event: 'generateReply',
        platform: 'twitter',
        postAuthor: post.author || '',
        postContent: post.content || '',
        postId: post.postId,
        url: post.url,
      },
      (response) => {
        if (response?.success && response.reply) {
          alert(response.reply);
        } else {
          alert(response?.error || 'Failed to generate reply');
        }
      },
    );
  }

  if (isLoading) {
    return <LoadingPage />;
  }

  if (savedPosts.length === 0) {
    return (
      <EmptyState
        icon={<PostsIcon />}
        title="No saved posts"
        description="Visit X.com and click the save button on any post"
        action={
          <button
            type="button"
            onClick={() => chrome.tabs.create({ url: 'https://x.com' })}
            className="text-blue-600 hover:text-blue-700 text-sm font-medium"
          >
            Go to X.com
          </button>
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-gray-700 mb-3">
        Saved Posts ({savedPosts.length})
      </h3>

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {savedPosts.map((post) => (
          <div
            key={post.id}
            className="border border-gray-200 p-3 hover:border-gray-300 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                {post.author && (
                  <p className="text-sm font-medium text-gray-900 truncate">
                    @{post.author}
                  </p>
                )}
                {post.content && (
                  <p className="text-sm text-gray-600 line-clamp-2 mt-1">
                    {post.content}
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(post.savedAt).toLocaleDateString()}
                </p>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => generateReply(post)}
                  className="p-1.5 text-green-600 hover:bg-green-50"
                  title="Generate reply"
                >
                  <ReplyIcon />
                </button>
                <button
                  type="button"
                  onClick={() => createVideoFromPost(post)}
                  className="p-1.5 text-blue-600 hover:bg-blue-50"
                  title="Create"
                >
                  <CreateIcon />
                </button>
                <button
                  type="button"
                  onClick={() => chrome.tabs.create({ url: post.url })}
                  className="p-1.5 text-gray-500 hover:bg-gray-50"
                  title="View post"
                >
                  <ViewIcon />
                </button>
                <button
                  type="button"
                  onClick={() => removePost(post.id)}
                  className="p-1.5 text-red-500 hover:bg-red-50"
                  title="Remove"
                >
                  <CloseIcon />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
