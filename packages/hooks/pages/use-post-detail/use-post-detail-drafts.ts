'use client';

import type { IIngredient, IPost } from '@cloud/interfaces';
import { PostsService } from '@services/content/posts.service';
import { logger } from '@services/core/logger.service';
import { PageScope } from '@ui-constants/misc.constant';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface UsePostDetailDraftsOptions {
  postId: string;
  scope: PageScope;
  post: IPost | null;
  setPost: React.Dispatch<React.SetStateAction<IPost | null>>;
  getPostsService: () => Promise<PostsService>;
  handleUpdateChild: (childId: string, updates: Partial<IPost>) => void;
  updateDescriptionRefs: (refPostId: string, description: string) => void;
  updateLabelRefs: (refPostId: string, label: string) => void;
}

export interface UsePostDetailDraftsReturn {
  // Draft values
  labelDraft: string;
  setLabelDraft: (value: string) => void;
  descriptionDraft: string;
  setDescriptionDraft: (value: string) => void;
  childDescriptions: Map<string, string>;
  setChildDescription: (childId: string, value: string) => void;
  scheduleDraft: string;
  setScheduleDraft: (value: string) => void;
  selectedIngredients: IIngredient[];
  setSelectedIngredients: React.Dispatch<React.SetStateAction<IIngredient[]>>;

  // Dirty flags
  isContentDirty: boolean;
  isScheduleDirty: boolean;
  isDescriptionDirty: boolean;
  isLabelDirty: boolean;

  // Auto-save
  autoSaveRefs: {
    currentDescriptions: React.RefObject<Map<string, string>>;
    lastSavedDescriptions: React.RefObject<Map<string, string>>;
    currentLabels: React.RefObject<Map<string, string>>;
    lastSavedLabels: React.RefObject<Map<string, string>>;
    timeouts: React.RefObject<Map<string, NodeJS.Timeout>>;
  };
  performAutoSaveForPost: (postId: string) => Promise<void>;
}

export function usePostDetailDrafts({
  postId,
  scope,
  post,
  setPost,
  getPostsService,
  handleUpdateChild,
  updateDescriptionRefs,
  updateLabelRefs,
}: UsePostDetailDraftsOptions): UsePostDetailDraftsReturn {
  // Draft state
  const [labelDraft, setLabelDraft] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [childDescriptions, setChildDescriptions] = useState<
    Map<string, string>
  >(new Map());
  const [scheduleDraft, setScheduleDraft] = useState('');
  const [selectedIngredients, setSelectedIngredients] = useState<IIngredient[]>(
    [],
  );

  // Refs for reading current draft values without effect dependencies
  const descriptionDraftRef = useRef(descriptionDraft);
  descriptionDraftRef.current = descriptionDraft;
  const labelDraftRef = useRef(labelDraft);
  labelDraftRef.current = labelDraft;
  const selectedIngredientsRef = useRef(selectedIngredients);
  selectedIngredientsRef.current = selectedIngredients;

  // Auto-save refs
  const autoSaveTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const lastSavedDescriptionsRef = useRef<Map<string, string>>(new Map());
  const currentDescriptionsRef = useRef<Map<string, string>>(new Map());
  const lastSavedLabelsRef = useRef<Map<string, string>>(new Map());
  const currentLabelsRef = useRef<Map<string, string>>(new Map());
  const lastPostIdRef = useRef<string | null>(null);

  // Dirty flags
  const isDescriptionDirty = post
    ? descriptionDraft.trim() !== post.description
    : false;

  const isLabelDirty = post ? labelDraft.trim() !== (post.label || '') : false;

  const isContentDirty = isDescriptionDirty || isLabelDirty;

  const isScheduleDirty = !!(post && scheduleDraft !== post.scheduledDate);

  // Initialize post data when post ID changes
  useEffect(() => {
    if (!post) {
      return;
    }

    const isNewPost = lastPostIdRef.current !== post.id;
    if (!isNewPost) {
      return;
    }

    const children = post.children || [];
    const allPostsToInit = [post, ...children];

    allPostsToInit.forEach((p) => {
      currentDescriptionsRef.current.set(p.id, p.description ?? '');
      lastSavedDescriptionsRef.current.set(p.id, p.description ?? '');
      currentLabelsRef.current.set(p.id, p.label ?? '');
      lastSavedLabelsRef.current.set(p.id, p.label ?? '');
      updateDescriptionRefs(p.id, p.description ?? '');
      updateLabelRefs(p.id, p.label ?? '');
    });

    lastPostIdRef.current = post.id;

    setDescriptionDraft(post.description ?? '');
    setLabelDraft(post.label ?? '');

    const childDescriptionsMap = new Map<string, string>();
    children.forEach((child) => {
      childDescriptionsMap.set(child.id, child.description ?? '');
    });
    setChildDescriptions(childDescriptionsMap);
  }, [post?.id, updateDescriptionRefs, updateLabelRefs, post]);

  // Update refs when post data changes (for existing posts)
  useEffect(() => {
    if (!post || lastPostIdRef.current !== post.id) {
      return;
    }

    const children = post.children || [];
    const allPostsToUpdate = [post, ...children];

    allPostsToUpdate.forEach((p) => {
      const currentDesc = currentDescriptionsRef.current.get(p.id);
      const lastSavedDesc = lastSavedDescriptionsRef.current.get(p.id);
      if (currentDesc === lastSavedDesc) {
        const desc = p.description ?? '';
        lastSavedDescriptionsRef.current.set(p.id, desc);
        currentDescriptionsRef.current.set(p.id, desc);
      }
      const currentLbl = currentLabelsRef.current.get(p.id);
      const lastSavedLbl = lastSavedLabelsRef.current.get(p.id);
      if (currentLbl === lastSavedLbl) {
        const lbl = p.label ?? '';
        lastSavedLabelsRef.current.set(p.id, lbl);
        currentLabelsRef.current.set(p.id, lbl);
      }
    });
  }, [post?.id, post?.description, post?.label, post?.children, post]);

  // Sync parent post description and label drafts (only if not dirty)
  useEffect(() => {
    if (!post) {
      return;
    }

    const parentCurrentDesc = currentDescriptionsRef.current.get(post.id);
    const parentLastSavedDesc = lastSavedDescriptionsRef.current.get(post.id);

    if (parentCurrentDesc === parentLastSavedDesc) {
      const description = post.description ?? '';
      if (descriptionDraftRef.current !== description) {
        setDescriptionDraft(description);
      }
    }

    const parentCurrentLbl = currentLabelsRef.current.get(post.id);
    const parentLastSavedLbl = lastSavedLabelsRef.current.get(post.id);
    if (parentCurrentLbl === parentLastSavedLbl) {
      const label = post.label ?? '';
      if (labelDraftRef.current !== label) {
        setLabelDraft(label);
      }
    }
  }, [post?.id, post?.description, post?.label, post]);

  // Sync child descriptions (only if not dirty)
  useEffect(() => {
    if (!post) {
      return;
    }

    const children = post.children || [];
    if (children.length === 0) {
      if (childDescriptions.size > 0) {
        setChildDescriptions(new Map());
      }
      return;
    }

    setChildDescriptions((prev) => {
      const updated = new Map(prev);
      let hasChanges = false;

      children.forEach((child) => {
        const currentDesc = currentDescriptionsRef.current.get(child.id);
        const lastSavedDesc = lastSavedDescriptionsRef.current.get(child.id);
        if (currentDesc === lastSavedDesc) {
          const desc = child.description ?? '';
          if (!updated.has(child.id) || updated.get(child.id) !== desc) {
            updated.set(child.id, desc);
            hasChanges = true;
          }
        } else if (!updated.has(child.id)) {
          updated.set(child.id, child.description ?? '');
          hasChanges = true;
        }
      });

      const childIds = new Set(children.map((c) => c.id));
      prev.forEach((_, childId) => {
        if (!childIds.has(childId)) {
          updated.delete(childId);
          hasChanges = true;
        }
      });

      return hasChanges ? updated : prev;
    });
  }, [post?.id, post?.children, childDescriptions.size, post]);

  // Sync schedule draft
  useEffect(() => {
    if (!post) {
      return;
    }

    const scheduledDateStr = post.scheduledDate
      ? typeof post.scheduledDate === 'string'
        ? post.scheduledDate
        : new Date(post.scheduledDate).toISOString()
      : '';

    setScheduleDraft((current) =>
      current === scheduledDateStr ? current : scheduledDateStr,
    );
  }, [post?.id, post?.scheduledDate, post]);

  // Sync selected ingredients
  useEffect(() => {
    if (!post) {
      return;
    }

    const ingredients = post.ingredients || [];
    const current = selectedIngredientsRef.current;
    const currentIngredientIds = new Set(current.map((ing) => ing.id));
    const newIngredientIds = new Set(ingredients.map((ing) => ing.id));

    if (
      ingredients.length !== current.length ||
      ![...currentIngredientIds].every((id) => newIngredientIds.has(id))
    ) {
      setSelectedIngredients(ingredients);
    }
  }, [post?.id, post?.ingredients, post]);

  // Auto-save for post
  const performAutoSaveForPost = useCallback(
    async (postIdToSave: string) => {
      if (!postIdToSave) {
        return;
      }

      const currentDescription =
        currentDescriptionsRef.current.get(postIdToSave) || '';
      const currentLabel = (
        currentLabelsRef.current.get(postIdToSave) || ''
      ).trim();
      const lastSavedDescription =
        lastSavedDescriptionsRef.current.get(postIdToSave) || '';
      const lastSavedLabel = (
        lastSavedLabelsRef.current.get(postIdToSave) || ''
      ).trim();

      const descriptionChanged = currentDescription !== lastSavedDescription;
      const labelChanged = currentLabel !== lastSavedLabel;

      if (!descriptionChanged && !labelChanged) {
        return;
      }

      try {
        const service = await getPostsService();
        const updates: { description?: string; label?: string } = {};

        if (descriptionChanged) {
          updates.description = currentDescription;
        }
        if (labelChanged) {
          updates.label = currentLabel;
        }

        const updatedPost = await service.patch(postIdToSave, updates);

        if (updates.description !== undefined) {
          updateDescriptionRefs(postIdToSave, updatedPost.description ?? '');
          lastSavedDescriptionsRef.current.set(
            postIdToSave,
            updatedPost.description ?? '',
          );
          currentDescriptionsRef.current.set(
            postIdToSave,
            updatedPost.description ?? '',
          );
        }
        if (updates.label !== undefined) {
          updateLabelRefs(postIdToSave, updatedPost.label ?? '');
          lastSavedLabelsRef.current.set(postIdToSave, updatedPost.label ?? '');
          currentLabelsRef.current.set(postIdToSave, updatedPost.label ?? '');
        }

        if (postIdToSave === post?.id) {
          setPost((prevPost) => ({
            ...updatedPost,
            children: updatedPost.children ?? prevPost?.children ?? [],
            credential: updatedPost.credential ?? prevPost?.credential,
          }));
        } else {
          handleUpdateChild(postIdToSave, {
            description: updatedPost.description,
            label: updatedPost.label,
          });
          if (updates.description !== undefined) {
            setChildDescriptions((prev) => {
              const updated = new Map(prev);
              updated.set(postIdToSave, updatedPost.description ?? '');
              return updated;
            });
          }
        }
      } catch (err) {
        logger.error('Auto-save failed', err);
      }
    },
    [
      post,
      getPostsService,
      handleUpdateChild,
      updateDescriptionRefs,
      updateLabelRefs,
      setPost,
    ],
  );

  // Auto-save effect for parent post (only in Publisher scope)
  useEffect(() => {
    if (!postId || !post || scope !== PageScope.PUBLISHER) {
      return;
    }

    currentDescriptionsRef.current.set(post.id, descriptionDraft);
    currentLabelsRef.current.set(post.id, labelDraft);

    const currentDescription =
      currentDescriptionsRef.current.get(post.id) || '';
    const lastSavedDescription =
      lastSavedDescriptionsRef.current.get(post.id) || '';
    const currentLabel = (currentLabelsRef.current.get(post.id) || '').trim();
    const lastSavedLabel = (
      lastSavedLabelsRef.current.get(post.id) || ''
    ).trim();

    const descriptionChanged = currentDescription !== lastSavedDescription;
    const labelChanged = currentLabel !== lastSavedLabel;

    if (!descriptionChanged && !labelChanged) {
      return;
    }

    const existingTimeout = autoSaveTimeoutsRef.current.get(post.id);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const timeout = setTimeout(() => {
      performAutoSaveForPost(post.id);
    }, 5_000);

    autoSaveTimeoutsRef.current.set(post.id, timeout);

    return () => {
      const timeoutToClear = autoSaveTimeoutsRef.current.get(post.id);
      if (timeoutToClear) {
        clearTimeout(timeoutToClear);
        autoSaveTimeoutsRef.current.delete(post.id);
      }
    };
  }, [
    descriptionDraft,
    labelDraft,
    postId,
    post?.id,
    performAutoSaveForPost,
    scope,
    post,
  ]);

  // Child description setter
  const setChildDescription = useCallback((childId: string, value: string) => {
    currentDescriptionsRef.current.set(childId, value);
    setChildDescriptions((prev) => new Map(prev).set(childId, value));
  }, []);

  return {
    autoSaveRefs: {
      currentDescriptions: currentDescriptionsRef,
      currentLabels: currentLabelsRef,
      lastSavedDescriptions: lastSavedDescriptionsRef,
      lastSavedLabels: lastSavedLabelsRef,
      timeouts: autoSaveTimeoutsRef,
    },
    childDescriptions,
    descriptionDraft,
    isContentDirty,
    isDescriptionDirty,
    isLabelDirty,
    isScheduleDirty,
    labelDraft,
    performAutoSaveForPost,
    scheduleDraft,
    selectedIngredients,
    setChildDescription,
    setDescriptionDraft,
    setLabelDraft,
    setScheduleDraft,
    setSelectedIngredients,
  };
}
