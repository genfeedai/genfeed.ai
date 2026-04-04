'use client';

import { ArrowLeft, Film, ImageIcon, Music, RefreshCw, Trash2 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { GalleryGrid } from '@/components/gallery/GalleryGrid';
import { LightboxModal } from '@/components/gallery/LightboxModal';
import { Pagination } from '@/components/gallery/Pagination';
import type { GalleryFilterType, GalleryItem, GalleryResponse } from '@/lib/gallery/types';

const FILTERS: { type: GalleryFilterType; label: string; icon: typeof ImageIcon }[] = [
  { icon: ImageIcon, label: 'All', type: 'all' },
  { icon: ImageIcon, label: 'Images', type: 'image' },
  { icon: Film, label: 'Videos', type: 'video' },
  { icon: Music, label: 'Audio', type: 'audio' },
];

export default function GalleryPage() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [filter, setFilter] = useState<GalleryFilterType>('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [counts, setCounts] = useState<GalleryResponse['counts']>({
    all: 0,
    audio: 0,
    image: 0,
    video: 0,
  });

  const selectedItem = selectedIndex !== null ? items[selectedIndex] : null;

  const fetchGallery = useCallback(
    async (targetPage: number, targetFilter: GalleryFilterType, signal?: AbortSignal) => {
      try {
        const params = new URLSearchParams({
          page: String(targetPage),
          pageSize: '30',
          type: targetFilter,
        });
        const response = await fetch(`/api/gallery?${params}`, { signal });
        if (!response.ok) throw new Error('Failed to load gallery');
        const data: GalleryResponse = await response.json();
        setItems(data.items);
        setTotal(data.total);
        setPage(data.page);
        setTotalPages(data.totalPages);
        setCounts(data.counts);
        setError(null);
      } catch (err) {
        if (signal?.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load gallery');
      }
    },
    []
  );

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      await fetchGallery(1, 'all', controller.signal);
      setIsLoading(false);
    }

    load();
    return () => controller.abort();
  }, [fetchGallery]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchGallery(page, filter);
    setIsRefreshing(false);
  }, [fetchGallery, page, filter]);

  const handleFilterChange = useCallback(
    async (newFilter: GalleryFilterType) => {
      setFilter(newFilter);
      setSelectedIndex(null);
      setIsRefreshing(true);
      await fetchGallery(1, newFilter);
      setIsRefreshing(false);
    },
    [fetchGallery]
  );

  const handlePageChange = useCallback(
    async (newPage: number) => {
      setSelectedIndex(null);
      setIsRefreshing(true);
      await fetchGallery(newPage, filter);
      setIsRefreshing(false);
      window.scrollTo({ behavior: 'smooth', top: 0 });
    },
    [fetchGallery, filter]
  );

  const handleSelect = useCallback(
    (item: GalleryItem) => {
      const index = items.findIndex((i) => i.id === item.id);
      setSelectedIndex(index >= 0 ? index : null);
    },
    [items]
  );

  const handlePrev = useCallback(() => {
    if (selectedIndex === null || items.length === 0) return;
    setSelectedIndex(selectedIndex > 0 ? selectedIndex - 1 : items.length - 1);
  }, [selectedIndex, items.length]);

  const handleNext = useCallback(() => {
    if (selectedIndex === null || items.length === 0) return;
    setSelectedIndex(selectedIndex < items.length - 1 ? selectedIndex + 1 : 0);
  }, [selectedIndex, items.length]);

  const handleDelete = useCallback(
    async (item: GalleryItem) => {
      try {
        const response = await fetch(`/api/gallery/${item.path}`, {
          method: 'DELETE',
        });
        if (!response.ok) throw new Error('Failed to delete file');

        // If this was the last item on the page, go to previous page
        const isLastOnPage = items.length === 1 && page > 1;
        const targetPage = isLastOnPage ? page - 1 : page;

        // Re-fetch to get accurate server state
        await fetchGallery(targetPage, filter);

        // Adjust selection
        if (selectedIndex !== null) {
          const remaining = items.length - 1;
          if (remaining === 0) {
            setSelectedIndex(null);
          } else if (selectedIndex >= remaining) {
            setSelectedIndex(remaining - 1);
          }
        }
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed to delete file');
      }
    },
    [items, selectedIndex, page, filter, fetchGallery]
  );

  const handleClose = useCallback(() => {
    setSelectedIndex(null);
  }, []);

  const handleDeleteAll = useCallback(async () => {
    const typeLabel = filter === 'all' ? 'all items' : `all ${filter}s`;
    const count = counts[filter];

    if (!confirm(`Delete ${count} ${typeLabel}? This cannot be undone.`)) {
      return;
    }

    setIsDeleting(true);
    try {
      // Fetch all matching items to get their paths
      const params = new URLSearchParams({
        page: '1',
        pageSize: String(count),
        type: filter,
      });
      const allResponse = await fetch(`/api/gallery?${params}`);
      if (!allResponse.ok) throw new Error('Failed to fetch items for deletion');
      const allData: GalleryResponse = await allResponse.json();

      await Promise.all(
        allData.items.map((item) => fetch(`/api/gallery/${item.path}`, { method: 'DELETE' }))
      );

      setSelectedIndex(null);
      setFilter('all');
      await fetchGallery(1, 'all');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete files');
    } finally {
      setIsDeleting(false);
    }
  }, [filter, counts, fetchGallery]);

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Header */}
      <header className="border-b border-[var(--border)] bg-[var(--card)]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/workflows"
              className="p-2 rounded-lg hover:bg-[var(--secondary)] transition"
            >
              <ArrowLeft className="w-5 h-5 text-[var(--muted-foreground)]" />
            </Link>
            <Image
              src="https://cdn.genfeed.ai/assets/branding/logo-white.png"
              alt="Genfeed"
              width={32}
              height={32}
              className="h-8 w-auto"
              unoptimized
            />
            <h1 className="text-xl font-semibold text-[var(--foreground)]">Gallery</h1>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-sm text-[var(--muted-foreground)]">
              {total} {total === 1 ? 'item' : 'items'}
            </p>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-2 rounded-lg bg-[var(--secondary)] hover:bg-[var(--secondary)]/80 transition disabled:opacity-50"
            >
              <RefreshCw
                className={`w-4 h-4 text-[var(--foreground)] ${isRefreshing ? 'animate-spin' : ''}`}
              />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Filters and actions */}
        {!isLoading && !error && counts.all > 0 && (
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              {FILTERS.map(({ type, label, icon: Icon }) => (
                <button
                  key={type}
                  onClick={() => handleFilterChange(type)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    filter === type
                      ? 'bg-white text-black'
                      : 'bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                  {type !== 'all' && <span className="text-xs opacity-60">({counts[type]})</span>}
                </button>
              ))}
            </div>
            <button
              onClick={handleDeleteAll}
              disabled={isDeleting || items.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-500/10 text-red-500 hover:bg-red-500/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
              {isDeleting ? 'Deleting...' : `Delete ${filter === 'all' ? 'All' : `${filter}s`}`}
            </button>
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-[var(--muted-foreground)]">Loading gallery...</p>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="text-center py-20">
            <p className="text-red-500 mb-4">{error}</p>
            <button
              onClick={handleRefresh}
              className="px-4 py-2 bg-[var(--secondary)] text-[var(--foreground)] rounded-lg hover:opacity-90 transition"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && counts.all === 0 && (
          <div className="text-center py-20">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--secondary)] flex items-center justify-center">
              <ImageIcon className="w-8 h-8 text-[var(--muted-foreground)]" />
            </div>
            <h3 className="text-lg font-medium text-[var(--foreground)] mb-2">No assets yet</h3>
            <p className="text-[var(--muted-foreground)] mb-6">
              Generated images, videos, and audio will appear here
            </p>
            <Link
              href="/workflows"
              className="inline-flex items-center gap-2 px-4 py-2 bg-white text-black rounded-lg text-sm font-medium hover:bg-white/90 transition"
            >
              Go to Workflows
            </Link>
          </div>
        )}

        {/* Empty filter state */}
        {!isLoading && !error && counts.all > 0 && items.length === 0 && (
          <div className="text-center py-20">
            <p className="text-[var(--muted-foreground)]">No {filter}s found</p>
          </div>
        )}

        {/* Gallery grid */}
        {!isLoading && !error && items.length > 0 && (
          <>
            <GalleryGrid items={items} onSelect={handleSelect} />
            <Pagination page={page} totalPages={totalPages} onPageChange={handlePageChange} />
          </>
        )}
      </main>

      {/* Lightbox modal */}
      <LightboxModal
        item={selectedItem}
        onClose={handleClose}
        onPrev={items.length > 1 ? handlePrev : undefined}
        onNext={items.length > 1 ? handleNext : undefined}
        onDelete={handleDelete}
      />
    </div>
  );
}
