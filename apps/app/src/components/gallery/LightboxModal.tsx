'use client';

import {
  ChevronLeft,
  ChevronRight,
  Download,
  Music,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect } from 'react';
import type { GalleryItem } from '@/lib/gallery/types';

interface LightboxModalProps {
  item: GalleryItem | null;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onDelete?: (item: GalleryItem) => void;
}

export function LightboxModal({
  item,
  onClose,
  onPrev,
  onNext,
  onDelete,
}: LightboxModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && onPrev) onPrev();
      if (e.key === 'ArrowRight' && onNext) onNext();
    },
    [onClose, onPrev, onNext],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleDownload = useCallback(() => {
    if (!item) return;
    const link = document.createElement('a');
    link.href = `/api/gallery/${item.path}`;
    link.download = item.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [item]);

  const handleDelete = useCallback(() => {
    if (!item || !onDelete) return;
    if (confirm(`Delete "${item.name}"?`)) {
      onDelete(item);
    }
  }, [item, onDelete]);

  if (!item) return null;

  const mediaUrl = `/api/gallery/${item.path}`;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/80" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-4 z-50 flex items-center justify-center pointer-events-none">
        {/* Top buttons */}
        <div className="absolute top-0 right-0 flex items-center gap-2 pointer-events-auto">
          {(item.type === 'image' || item.type === 'video') && (
            <Link
              href={`/editor?asset=${encodeURIComponent(item.path)}`}
              className="p-2 rounded-lg bg-[var(--card)] border border-[var(--border)] hover:bg-[var(--secondary)] transition"
            >
              <Pencil className="w-5 h-5 text-[var(--foreground)]" />
            </Link>
          )}
          {onDelete && (
            <button
              onClick={handleDelete}
              className="p-2 rounded-lg bg-[var(--card)] border border-[var(--border)] hover:bg-red-500/20 hover:border-red-500/50 transition"
            >
              <Trash2 className="w-5 h-5 text-red-500" />
            </button>
          )}
          <button
            onClick={handleDownload}
            className="p-2 rounded-lg bg-[var(--card)] border border-[var(--border)] hover:bg-[var(--secondary)] transition"
          >
            <Download className="w-5 h-5 text-[var(--foreground)]" />
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-[var(--card)] border border-[var(--border)] hover:bg-[var(--secondary)] transition"
          >
            <X className="w-5 h-5 text-[var(--foreground)]" />
          </button>
        </div>

        {/* Previous button */}
        {onPrev && (
          <button
            onClick={onPrev}
            className="absolute left-0 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-[var(--card)] border border-[var(--border)] hover:bg-[var(--secondary)] transition pointer-events-auto"
          >
            <ChevronLeft className="w-6 h-6 text-[var(--foreground)]" />
          </button>
        )}

        {/* Next button */}
        {onNext && (
          <button
            onClick={onNext}
            className="absolute right-0 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-[var(--card)] border border-[var(--border)] hover:bg-[var(--secondary)] transition pointer-events-auto"
          >
            <ChevronRight className="w-6 h-6 text-[var(--foreground)]" />
          </button>
        )}

        {/* Media */}
        <div className="max-h-full max-w-full pointer-events-auto">
          {item.type === 'image' && (
            <img
              src={mediaUrl}
              alt={item.name}
              className="max-h-[calc(100vh-4rem)] max-w-[calc(100vw-8rem)] object-contain rounded-lg"
            />
          )}
          {item.type === 'video' && (
            <video
              src={mediaUrl}
              controls
              autoPlay
              className="max-h-[calc(100vh-4rem)] max-w-[calc(100vw-8rem)] rounded-lg"
            />
          )}
          {item.type === 'audio' && (
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-8 flex flex-col items-center gap-4">
              <div className="w-24 h-24 rounded-full bg-[var(--secondary)] flex items-center justify-center">
                <Music className="w-12 h-12 text-[var(--primary)]" />
              </div>
              <audio src={mediaUrl} controls autoPlay className="w-80" />
            </div>
          )}
        </div>

        {/* Filename */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 px-4 py-2 bg-[var(--card)] border border-[var(--border)] rounded-lg pointer-events-auto">
          <p className="text-sm text-[var(--foreground)] truncate max-w-[300px]">
            {item.name}
          </p>
        </div>
      </div>
    </>
  );
}
