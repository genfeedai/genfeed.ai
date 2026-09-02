'use client';

import {
  ButtonSize,
  ButtonVariant,
  CardVariant,
  formatPlatformLabel,
  parseSocialPostUrl,
  SocialSourcePlatform,
} from '@genfeedai/contracts';
import type {
  ISocialSource,
  SocialSourceValidationResult,
} from '@genfeedai/contracts/interfaces';
import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { SocialSourcesService } from '@services/social/social-sources.service';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import FormSearchbar from '@ui/primitives/searchbar';
import { Download, Loader2, Plus, Search, UserPlus } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

const PLATFORM_OPTIONS = [
  { label: 'X', value: SocialSourcePlatform.TWITTER },
  { label: 'Instagram', value: SocialSourcePlatform.INSTAGRAM },
  { label: 'TikTok', value: SocialSourcePlatform.TIKTOK },
] as const;

type SourceCandidate = {
  key: string;
  platform: SocialSourcePlatform;
  handle: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  profileUrl?: string | null;
  followersCount?: number | null;
  externalId?: string | null;
  isAlreadyFollowed: boolean;
  isValid: boolean;
  error?: string;
};

type Props = {
  brandId: string;
  existingSources: ISocialSource[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFollowed: () => Promise<void> | void;
};

export function normalizeSearchQuery(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const url = new URL(trimmed);
      const path = url.pathname.split('/').find(Boolean) ?? '';
      return path.replace(/^@/, '').toLowerCase();
    }
  } catch {
    // treat as plain handle
  }
  return trimmed.replace(/^@/, '').replace(/^\/+/, '').toLowerCase();
}

export function candidateKey(platform: string, handle: string): string {
  return `${platform}:${handle.toLowerCase()}`;
}

function isCandidateSelectable(candidate: {
  isAlreadyFollowed: boolean;
  isValid: boolean;
}): boolean {
  return candidate.isValid && !candidate.isAlreadyFollowed;
}

const CHECKBOX_CLASS_NAME =
  'mt-1 size-4 shrink-0 !border-foreground/50 data-[state=checked]:!border-foreground data-[state=checked]:!bg-foreground data-[state=checked]:!text-background';

export default function FollowSourceModal({
  brandId,
  existingSources,
  open,
  onOpenChange,
  onFollowed,
}: Props) {
  const translate = useTranslations('common.following.followModal');
  const notifications = useMemo(() => NotificationsService.getInstance(), []);
  const getSocialSourcesService = useAuthedService((token: string) =>
    SocialSourcesService.getInstance(token),
  );

  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [candidates, setCandidates] = useState<SourceCandidate[]>([]);
  // string[] (not Set) so React state updates stay referentially obvious in tests/UI
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  // A pasted URL with a post identifier switches the modal into the explicit
  // import-post vs follow-account choice (#2660) — it never silently degrades
  // into following the whole account.
  const postReference = useMemo(() => parseSocialPostUrl(query), [query]);

  const followedKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const source of existingSources) {
      if (!source.isActive) {
        continue;
      }
      keys.add(candidateKey(String(source.platform), source.handle));
    }
    return keys;
  }, [existingSources]);

  const resetState = useCallback(() => {
    setQuery('');
    setIsSearching(false);
    setIsFollowing(false);
    setIsImporting(false);
    setHasSearched(false);
    setCandidates([]);
    setSelectedKeys([]);
  }, []);

  useEffect(() => {
    if (!open) {
      resetState();
    }
  }, [open, resetState]);

  const selectableCandidates = useMemo(
    () => candidates.filter(isCandidateSelectable),
    [candidates],
  );

  const selectedKeySet = useMemo(() => new Set(selectedKeys), [selectedKeys]);

  const selectedCount = useMemo(
    () =>
      selectableCandidates.filter((item) => selectedKeySet.has(item.key))
        .length,
    [selectableCandidates, selectedKeySet],
  );

  const importPost = useCallback(async () => {
    if (!postReference) {
      return;
    }

    try {
      setIsImporting(true);
      const service = await getSocialSourcesService();
      const result = await service.importPost(query.trim(), { brandId });
      notifications.success(
        result.deduplicated
          ? 'Post already imported — metrics refreshed'
          : 'Post imported',
      );
      await onFollowed();
      onOpenChange(false);
    } catch (error) {
      logger.error('Failed to import post', {
        error,
        platform: postReference.platform,
        postId: postReference.postId,
      });
      notifications.error((error as Error)?.message || 'Failed to import post');
    } finally {
      setIsImporting(false);
    }
  }, [
    brandId,
    getSocialSourcesService,
    notifications,
    onFollowed,
    onOpenChange,
    postReference,
    query,
  ]);

  const runSearch = useCallback(
    async (queryOverride?: string) => {
      const handle = normalizeSearchQuery(queryOverride ?? query);
      if (!handle) {
        notifications.error('Enter a handle to search');
        return;
      }

      try {
        setIsSearching(true);
        setHasSearched(true);
        const service = await getSocialSourcesService();

        const results = await Promise.all(
          PLATFORM_OPTIONS.map(async (option) => {
            try {
              const result = await service.validateSource(option.value, handle);
              return { option, result };
            } catch (error: unknown) {
              logger.error('Source search failed', {
                error,
                handle,
                platform: option.value,
              });
              const failed: SocialSourceValidationResult = {
                error: (error as Error)?.message ?? 'Lookup failed',
                valid: false,
              };
              return { option, result: failed };
            }
          }),
        );

        const nextCandidates: SourceCandidate[] = results.map(
          ({ option, result }) => {
            const resolvedHandle = (result.handle || handle)
              .replace(/^@/, '')
              .toLowerCase();
            const key = candidateKey(option.value, resolvedHandle);
            return {
              avatarUrl: result.avatarUrl,
              displayName: result.displayName,
              error: result.error,
              externalId: result.externalId,
              followersCount: result.followersCount,
              handle: resolvedHandle,
              isAlreadyFollowed: followedKeys.has(key),
              isValid: result.valid,
              key,
              platform: option.value,
              profileUrl: result.profileUrl,
            };
          },
        );

        setCandidates(nextCandidates);
        // Auto-select every new match so a single hit is ready to follow immediately.
        setSelectedKeys(
          nextCandidates.filter(isCandidateSelectable).map((item) => item.key),
        );
      } catch (error) {
        logger.error('Follow source search failed', error);
        notifications.error('Could not search for that handle');
      } finally {
        setIsSearching(false);
      }
    },
    [followedKeys, getSocialSourcesService, notifications, query],
  );

  const followAuthorInstead = useCallback(() => {
    if (!postReference?.authorHandle) {
      return;
    }
    setQuery(postReference.authorHandle);
    runSearch(postReference.authorHandle).catch(() => undefined);
  }, [postReference, runSearch]);

  const toggleCandidate = useCallback((key: string) => {
    setSelectedKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  }, []);

  const selectAllSelectable = useCallback(() => {
    setSelectedKeys(selectableCandidates.map((item) => item.key));
  }, [selectableCandidates]);

  const clearSelection = useCallback(() => {
    setSelectedKeys([]);
  }, []);

  const followSelected = useCallback(async () => {
    const toFollow = selectableCandidates.filter((item) =>
      selectedKeySet.has(item.key),
    );
    if (!toFollow.length) {
      notifications.error('Select at least one account to follow');
      return;
    }

    try {
      setIsFollowing(true);
      const service = await getSocialSourcesService();
      let followed = 0;
      let failed = 0;

      let postsCollected = 0;

      for (const candidate of toFollow) {
        try {
          const source = await service.post({
            avatarUrl: candidate.avatarUrl ?? undefined,
            displayName: candidate.displayName ?? undefined,
            externalId: candidate.externalId ?? undefined,
            followersCount: candidate.followersCount ?? undefined,
            handle: candidate.handle,
            platform: candidate.platform,
            profileUrl: candidate.profileUrl ?? undefined,
          });
          const syncResult = await service.syncSource(source.id, {
            brandId,
            limit: 25,
          });
          postsCollected += syncResult.count ?? 0;
          followed += 1;
        } catch (error) {
          failed += 1;
          logger.error('Failed to follow candidate source', {
            error,
            handle: candidate.handle,
            platform: candidate.platform,
          });
        }
      }

      if (followed > 0) {
        notifications.success(
          postsCollected > 0
            ? followed === 1
              ? `Followed 1 source · ${postsCollected} posts`
              : `Followed ${followed} sources · ${postsCollected} posts`
            : followed === 1
              ? 'Source followed · 0 posts collected (check collector config)'
              : `${followed} sources followed · 0 posts collected`,
        );
        await onFollowed();
        onOpenChange(false);
      }
      if (failed > 0) {
        notifications.error(
          failed === 1
            ? 'One account could not be followed'
            : `${failed} accounts could not be followed`,
        );
      }
    } catch (error) {
      logger.error('Batch follow failed', error);
      notifications.error('Failed to follow selected accounts');
    } finally {
      setIsFollowing(false);
    }
  }, [
    brandId,
    getSocialSourcesService,
    notifications,
    onFollowed,
    onOpenChange,
    selectableCandidates,
    selectedKeySet,
  ]);

  const handleSubmitSearch = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      // A pasted post URL requires an explicit import/follow choice — Enter
      // must not create anything on its own.
      if (postReference) {
        return;
      }
      runSearch().catch(() => undefined);
    },
    [postReference, runSearch],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{translate('title')}</DialogTitle>
          <DialogDescription>{translate('description')}</DialogDescription>
        </DialogHeader>

        <form className="space-y-3" onSubmit={handleSubmitSearch}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <FormSearchbar
                value={query}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setQuery(event.target.value)
                }
                onClear={() => {
                  setQuery('');
                  setCandidates([]);
                  setHasSearched(false);
                  setSelectedKeys([]);
                }}
                placeholder="Handle or post URL (e.g. x.com/…/status/…)"
              />
            </div>
            {!postReference ? (
              <Button
                icon={
                  isSearching ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Search className="size-4" />
                  )
                }
                isLoading={isSearching}
                label="Search"
                type="submit"
                variant={ButtonVariant.SECONDARY}
              />
            ) : null}
          </div>
        </form>

        <div className="min-h-40 space-y-3">
          {postReference ? (
            <Card bodyClassName="space-y-3" variant={CardVariant.DEFAULT}>
              <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
                {getPlatformIcon(postReference.platform, 'h-4 w-4')}
                <span className="font-medium">
                  {translate('postLabel', {
                    platform:
                      formatPlatformLabel(postReference.platform) ??
                      postReference.platform,
                  })}
                </span>
                {postReference.authorHandle ? (
                  <span className="text-foreground/60">
                    {translate('byAuthor', {
                      author: postReference.authorHandle,
                    })}
                  </span>
                ) : null}
              </div>
              <p className="text-xs leading-5 text-foreground/58">
                {translate('postChoice')}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  icon={
                    isImporting ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Download className="size-4" />
                    )
                  }
                  isLoading={isImporting}
                  label="Import post"
                  onClick={() => {
                    importPost().catch(() => undefined);
                  }}
                  size={ButtonSize.SM}
                  type="button"
                  variant={ButtonVariant.DEFAULT}
                />
                {postReference.authorHandle ? (
                  <Button
                    icon={<UserPlus className="size-4" />}
                    isDisabled={isImporting}
                    label={`Follow @${postReference.authorHandle} instead`}
                    onClick={followAuthorInstead}
                    size={ButtonSize.SM}
                    type="button"
                    variant={ButtonVariant.SECONDARY}
                  />
                ) : null}
              </div>
            </Card>
          ) : null}

          {isSearching ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-foreground/60">
              <Loader2 className="size-4 animate-spin" />
              {translate('lookingUp')}
            </div>
          ) : null}

          {!isSearching &&
          !postReference &&
          hasSearched &&
          !candidates.length ? (
            <div className="rounded-card border border-border px-4 py-8 text-center text-sm text-foreground/62">
              {translate('noAccounts')}
            </div>
          ) : null}

          {!isSearching && !postReference && candidates.length > 0 ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-foreground/55">
                  {selectableCandidates.length
                    ? `${selectableCandidates.length} account${selectableCandidates.length === 1 ? '' : 's'} available`
                    : 'No new accounts to follow'}
                </p>
                {selectableCandidates.length > 0 ? (
                  <div className="flex gap-1">
                    {selectableCandidates.length > 1 ? (
                      <Button
                        label="Select all"
                        onClick={selectAllSelectable}
                        size={ButtonSize.SM}
                        type="button"
                        variant={ButtonVariant.GHOST}
                      />
                    ) : null}
                    <Button
                      label="Clear"
                      onClick={clearSelection}
                      size={ButtonSize.SM}
                      type="button"
                      variant={ButtonVariant.GHOST}
                    />
                  </div>
                ) : null}
              </div>

              <ul
                aria-label="Source search results"
                className="max-h-[42vh] space-y-2 overflow-y-auto pr-0.5"
              >
                {candidates.map((candidate) => {
                  const platformLabel =
                    PLATFORM_OPTIONS.find(
                      (option) => option.value === candidate.platform,
                    )?.label ?? candidate.platform;
                  const canSelect = isCandidateSelectable(candidate);
                  const isChecked = selectedKeySet.has(candidate.key);
                  const selectLabel = `Select ${platformLabel} @${candidate.handle}`;

                  const rowBody = (
                    <>
                      {canSelect ? (
                        // pointer-events-none: row owns the toggle (avoids double-toggle
                        // from nested checkbox button + row click). Matches MultiSelect.
                        <div className="pointer-events-none">
                          <Checkbox
                            aria-hidden
                            className={CHECKBOX_CLASS_NAME}
                            isChecked={isChecked}
                            name={`follow-source-${candidate.key}`}
                            onChange={() => {
                              // Selection is owned by the row click/keyboard handler.
                            }}
                            tabIndex={-1}
                          />
                        </div>
                      ) : (
                        <div className="mt-1 size-4 shrink-0" />
                      )}

                      {candidate.avatarUrl ? (
                        <Image
                          alt=""
                          className="size-10 shrink-0 rounded-full object-cover"
                          height={40}
                          src={candidate.avatarUrl}
                          unoptimized
                          width={40}
                        />
                      ) : (
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground/50">
                          {getPlatformIcon(candidate.platform, 'h-4 w-4')}
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {getPlatformIcon(candidate.platform, 'h-3.5 w-3.5')}
                          <span className="text-sm font-medium text-foreground">
                            @{candidate.handle}
                          </span>
                          <Badge variant="ghost">{platformLabel}</Badge>
                          {candidate.isAlreadyFollowed ? (
                            <Badge variant="secondary">
                              {translate('following')}
                            </Badge>
                          ) : null}
                          {!candidate.isValid ? (
                            <Badge variant="ghost">
                              {translate('notFound')}
                            </Badge>
                          ) : null}
                        </div>
                        {candidate.displayName ? (
                          <p className="mt-0.5 truncate text-xs text-foreground/60">
                            {candidate.displayName}
                            {typeof candidate.followersCount === 'number'
                              ? ` · ${formatCompactNumber(candidate.followersCount)} followers`
                              : ''}
                          </p>
                        ) : null}
                        {!candidate.isValid && candidate.error ? (
                          <p className="mt-1 text-xs text-foreground/50">
                            {candidate.error}
                          </p>
                        ) : null}
                      </div>
                    </>
                  );

                  return (
                    <li key={candidate.key}>
                      {canSelect ? (
                        <div
                          aria-checked={isChecked}
                          aria-label={selectLabel}
                          className={`flex w-full items-start gap-3 rounded-card border px-3 py-3 text-left transition-colors ${
                            isChecked
                              ? 'cursor-pointer border-foreground/35 bg-foreground/[0.06]'
                              : 'cursor-pointer border-border bg-card hover:bg-hover/40'
                          }`}
                          onClick={() => {
                            toggleCandidate(candidate.key);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              toggleCandidate(candidate.key);
                            }
                          }}
                          role="checkbox"
                          tabIndex={0}
                        >
                          {rowBody}
                        </div>
                      ) : (
                        <div
                          className={[
                            'flex w-full items-start gap-3 rounded-card border border-border px-3 py-3 text-left opacity-80',
                            'bg-background-secondary/40',
                          ].join(' ')}
                        >
                          {rowBody}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}

          {!isSearching && !postReference && !hasSearched ? (
            <div className="rounded-card border border-dashed border-border px-4 py-8 text-center text-sm leading-6 text-foreground/58">
              {translate('emptyHint')}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            label="Cancel"
            onClick={() => onOpenChange(false)}
            type="button"
            variant={ButtonVariant.GHOST}
          />
          <Button
            icon={<Plus className="size-4" />}
            isLoading={isFollowing}
            label={
              selectedCount > 1
                ? `Follow ${selectedCount} accounts`
                : 'Follow selected'
            }
            onClick={() => {
              followSelected().catch(() => undefined);
            }}
            type="button"
            variant={ButtonVariant.DEFAULT}
            isDisabled={selectedCount === 0 || isSearching}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
