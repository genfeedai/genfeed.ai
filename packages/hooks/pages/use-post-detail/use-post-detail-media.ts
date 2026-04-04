'use client';

import type { IIngredient, IPost } from '@cloud/interfaces';
import {
  CredentialPlatform,
  IngredientCategory,
  Platform,
} from '@genfeedai/enums';
import { getFormatForPlatform } from '@hooks/pages/use-post-detail/use-post-detail-state';
import type { Post } from '@models/content/post.model';
import {
  type GallerySelectItem,
  useGalleryModal,
  useGenerateIllustrationModal,
} from '@providers/global-modals/global-modals.provider';
import { PostsService } from '@services/content/posts.service';
import { logger } from '@services/core/logger.service';
import type { NotificationsService } from '@services/core/notifications.service';
import { getCarouselLimits } from '@utils/carousel-validation';
import { useCallback } from 'react';

export interface UsePostDetailMediaOptions {
  post: IPost | null;
  setPost: React.Dispatch<React.SetStateAction<IPost | null>>;
  sortedChildren: IPost[];
  getPostsService: () => Promise<PostsService>;
  notificationsService: NotificationsService;
  fetchPost: (isRefresh?: boolean) => Promise<void>;
  handleUpdateChild: (childId: string, updates: Partial<IPost>) => void;
  setSelectedIngredients: React.Dispatch<React.SetStateAction<IIngredient[]>>;
  setIsSavingIngredients: React.Dispatch<React.SetStateAction<boolean>>;
}

export interface UsePostDetailMediaReturn {
  handleSelectMedia: (
    targetPostId: string,
    currentIngredients: IIngredient[],
  ) => void;
  handleGenerateIllustration: (
    postId: string,
    prompt: string,
    platform?: Platform,
  ) => void;
}

export function usePostDetailMedia({
  post,
  setPost,
  sortedChildren,
  getPostsService,
  notificationsService,
  fetchPost,
  handleUpdateChild,
  setSelectedIngredients,
  setIsSavingIngredients,
}: UsePostDetailMediaOptions): UsePostDetailMediaReturn {
  const { openGallery } = useGalleryModal();
  const { openGenerateIllustration } = useGenerateIllustrationModal();

  // Media selection handler
  const handleSelectMedia = useCallback(
    (targetPostId: string, currentIngredients: IIngredient[] = []) => {
      const isParentPost = targetPostId === post?.id;
      const targetPost = isParentPost
        ? post
        : sortedChildren.find((c) => c.id === targetPostId);

      if (!targetPost) {
        return;
      }

      const ingredientCategory =
        currentIngredients[0]?.category || IngredientCategory.IMAGE;

      const platform = targetPost?.credential?.platform as
        | CredentialPlatform
        | undefined;

      const carouselLimits = platform ? getCarouselLimits(platform) : null;
      const maxSelectableItems = carouselLimits?.max ?? 35;
      const format = getFormatForPlatform(platform as Platform);
      const selectedIds = currentIngredients.map((ing) => ing.id);

      openGallery({
        category: ingredientCategory,
        format,
        maxSelectableItems,
        onSelect: async (
          selected: GallerySelectItem | GallerySelectItem[] | null,
        ) => {
          if (!selected) {
            setIsSavingIngredients(true);
            try {
              const service = await getPostsService();
              await service.patch(targetPostId, {
                ingredients: [],
              });

              if (isParentPost) {
                setSelectedIngredients([]);
                setPost((prevPost) => ({
                  ...(prevPost || (post as IPost)),
                  ingredients: [],
                }));
              } else {
                handleUpdateChild(targetPostId, { ingredients: [] });
              }
            } finally {
              setIsSavingIngredients(false);
            }
            return;
          }

          const ingredientsArray = (Array.isArray(selected)
            ? selected
            : [selected]) as unknown as IIngredient[];

          const uniqueIngredients = ingredientsArray.filter(
            (ing, index, self) =>
              index === self.findIndex((i) => i.id === ing.id),
          );

          setIsSavingIngredients(true);
          try {
            const service = await getPostsService();
            await service.patch(targetPostId, {
              ingredients: uniqueIngredients.map((ing) => ing.id),
            } as unknown as Partial<Post>);

            if (isParentPost) {
              setSelectedIngredients(uniqueIngredients);
              setPost((prevPost) => ({
                ...(prevPost || (post as IPost)),
                ingredients: uniqueIngredients,
              }));
            } else {
              handleUpdateChild(targetPostId, {
                ingredients: uniqueIngredients,
              });
            }
          } finally {
            setIsSavingIngredients(false);
          }
        },
        selectedId: selectedIds.length === 1 ? selectedIds[0] : undefined,
        selectedReferences: selectedIds.length > 1 ? selectedIds : undefined,
        title: 'Select Media for Post',
      });
    },
    [
      openGallery,
      post,
      sortedChildren,
      getPostsService,
      handleUpdateChild,
      setPost,
      setSelectedIngredients,
      setIsSavingIngredients,
    ],
  );

  // Generate illustration handler
  const handleGenerateIllustration = useCallback(
    (targetPostId: string, prompt: string, platform?: Platform) => {
      openGenerateIllustration({
        initialPrompt: prompt,
        onConfirm: async (imageId: string) => {
          setIsSavingIngredients(true);
          try {
            const service = await getPostsService();
            await service.patch(targetPostId, {
              ingredients: [imageId],
            } as unknown as Partial<Post>);

            notificationsService.success(
              'Illustration generated and attached!',
            );

            await fetchPost(true);
          } catch (err) {
            logger.error('Failed to attach illustration', err);
            notificationsService.error('Failed to attach illustration to post');
          } finally {
            setIsSavingIngredients(false);
          }
        },
        platform,
        postId: targetPostId,
      });
    },
    [
      openGenerateIllustration,
      getPostsService,
      notificationsService,
      fetchPost,
      setIsSavingIngredients,
    ],
  );

  return {
    handleGenerateIllustration,
    handleSelectMedia,
  };
}
