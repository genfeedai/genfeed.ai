'use client';

import {
  ButtonSize,
  ButtonVariant,
  SocialSourcePlatform,
} from '@genfeedai/enums';
import type {
  ISocialSource,
  SocialSourceValidationResult,
} from '@genfeedai/interfaces';
import { formatCompactNumber } from '@helpers/formatting/format/format.helper';
import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { SocialSourcesService } from '@services/social/social-sources.service';
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
import { Loader2, Plus, Search } from 'lucide-react';
import Image from 'next/image';
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

function normalizeSearchQuery(value: string): string {
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

function candidateKey(platform: string, handle: string): string {
  return `${platform}:${handle.toLowerCase()}`;
}

export default function FollowSourceModal({
  brandId,
  existingSources,
  open,
  onOpenChange,
  onFollowed,
}: Props) {
  const notifications = useMemo(() => NotificationsService.getInstance(), []);
  const getSocialSourcesService = useAuthedService((token: string) =>
    SocialSourcesService.getInstance(token),
  );

  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [candidates, setCandidates] = useState<SourceCandidate[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

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
    setHasSearched(false);
    setCandidates([]);
    setSelectedKeys(new Set());
  }, []);

  useEffect(() => {
    if (!open) {
      resetState();
    }
  }, [open, resetState]);

  const selectableCandidates = useMemo(
    () => candidates.filter((item) => item.isValid && !item.isAlreadyFollowed),
    [candidates],
  );

  const selectedCount = useMemo(
    () =>
      selectableCandidates.filter((item) => selectedKeys.has(item.key)).length,
    [selectableCandidates, selectedKeys],
  );

  const runSearch = useCallback(async () => {
    const handle = normalizeSearchQuery(query);
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
      setSelectedKeys(
        new Set(
          nextCandidates
            .filter((item) => item.isValid && !item.isAlreadyFollowed)
            .map((item) => item.key),
        ),
      );
    } catch (error) {
      logger.error('Follow source search failed', error);
      notifications.error('Could not search for that handle');
    } finally {
      setIsSearching(false);
    }
  }, [followedKeys, getSocialSourcesService, notifications, query]);

  const toggleCandidate = useCallback((key: string, checked: boolean) => {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }, []);

  const selectAllSelectable = useCallback(() => {
    setSelectedKeys(new Set(selectableCandidates.map((item) => item.key)));
  }, [selectableCandidates]);

  const clearSelection = useCallback(() => {
    setSelectedKeys(new Set());
  }, []);

  const followSelected = useCallback(async () => {
    const toFollow = selectableCandidates.filter((item) =>
      selectedKeys.has(item.key),
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
            brand: brandId,
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
    selectedKeys,
  ]);

  const handleSubmitSearch = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      runSearch().catch(() => undefined);
    },
    [runSearch],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Follow sources</DialogTitle>
          <DialogDescription>
            Search a handle once — we look it up on X, Instagram, and TikTok so
            you can follow every matching public account in one step.
          </DialogDescription>
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
                  setSelectedKeys(new Set());
                }}
                placeholder="Search handle (e.g. vincentshipsit)"
              />
            </div>
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
          </div>
        </form>

        <div className="min-h-40 space-y-3">
          {isSearching ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-foreground/60">
              <Loader2 className="size-4 animate-spin" />
              Looking up accounts across platforms…
            </div>
          ) : null}

          {!isSearching && hasSearched && !candidates.length ? (
            <div className="rounded-card border border-border px-4 py-8 text-center text-sm text-foreground/62">
              No accounts found for that handle.
            </div>
          ) : null}

          {!isSearching && candidates.length > 0 ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-foreground/55">
                  {selectableCandidates.length
                    ? `${selectableCandidates.length} account${selectableCandidates.length === 1 ? '' : 's'} available`
                    : 'No new accounts to follow'}
                </p>
                {selectableCandidates.length > 1 ? (
                  <div className="flex gap-1">
                    <Button
                      label="Select all"
                      onClick={selectAllSelectable}
                      size={ButtonSize.SM}
                      type="button"
                      variant={ButtonVariant.GHOST}
                    />
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

              <ul className="max-h-[42vh] space-y-2 overflow-y-auto pr-0.5">
                {candidates.map((candidate) => {
                  const platformLabel =
                    PLATFORM_OPTIONS.find(
                      (option) => option.value === candidate.platform,
                    )?.label ?? candidate.platform;
                  const canSelect =
                    candidate.isValid && !candidate.isAlreadyFollowed;
                  const isChecked = selectedKeys.has(candidate.key);

                  return (
                    <li key={candidate.key}>
                      <div
                        className={`flex items-start gap-3 rounded-card border border-border px-3 py-3 ${
                          canSelect
                            ? 'bg-card'
                            : 'bg-background-secondary/40 opacity-80'
                        }`}
                      >
                        {canSelect ? (
                          <Checkbox
                            isChecked={isChecked}
                            onCheckedChange={(checked) =>
                              toggleCandidate(candidate.key, checked === true)
                            }
                            aria-label={`Select ${platformLabel} @${candidate.handle}`}
                            className="mt-1"
                          />
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
                              <Badge variant="secondary">Following</Badge>
                            ) : null}
                            {!candidate.isValid ? (
                              <Badge variant="ghost">Not found</Badge>
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
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}

          {!isSearching && !hasSearched ? (
            <div className="rounded-card border border-dashed border-border px-4 py-8 text-center text-sm leading-6 text-foreground/58">
              Try a public handle. We’ll check X, Instagram, and TikTok and let
              you follow every match together.
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
