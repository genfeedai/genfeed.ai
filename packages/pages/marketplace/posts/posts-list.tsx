'use client';

import type { IPost } from '@genfeedai/interfaces';
import {
  GALLERY_EMPTY_MESSAGES,
  GALLERY_EMPTY_SIZE,
  GALLERY_GRID_CLASS,
} from '@genfeedai/constants';
import { useGalleryList } from '@hooks/data/gallery/use-gallery-list/use-gallery-list';
import Card from '@ui/card/Card';
import CardEmpty from '@ui/card/empty/CardEmpty';
import Loading from '@ui/loading/default/Loading';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { HiDocumentText } from 'react-icons/hi2';

export default function PostsList(): ReactNode {
  const router = useRouter();

  const { items: posts, isLoading } = useGalleryList<IPost>({
    includeStatusFilter: false,
    type: 'posts',
  });

  if (isLoading) {
    return <Loading isFullSize={false} />;
  }

  return (
    <>
      {posts.length === 0 ? (
        <CardEmpty
          icon={HiDocumentText}
          label={GALLERY_EMPTY_MESSAGES.posts.label}
          description={GALLERY_EMPTY_MESSAGES.posts.description}
          action={{
            label: 'Create Post',
            onClick: () => router.push('/studio'),
          }}
          size={GALLERY_EMPTY_SIZE}
        />
      ) : (
        <div className={GALLERY_GRID_CLASS}>
          {posts.map((post) => (
            <Card
              key={post.id}
              className="p-6 hover:shadow-lg transition-shadow duration-300"
            >
              <div className="flex flex-col items-center space-y-4">
                <div className="w-20 h-20 bg-background rounded-full flex items-center justify-center">
                  <HiDocumentText className="text-3xl text-primary" />
                </div>
                <div className="text-center flex-1">
                  <h3 className="font-semibold truncate max-w-full">
                    {post.label || 'Untitled'}
                  </h3>
                  {post.description && (
                    <p className="text-sm text-foreground/60 line-clamp-2 mt-2">
                      {post.description}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-4">
        <AutoPagination />
      </div>
    </>
  );
}
