'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { Player } from '@remotion/player';
import Button from '@ui/buttons/base/Button';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import {
  ArrowDown,
  ArrowUp,
  Download,
  LoaderCircle,
  Plus,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { EditorComposition } from '@/components/editor/EditorComposition';

import {
  ASPECT_PRESETS,
  type AspectPresetId,
  createCompositionFromLaunchContext,
  createTimelineItem,
  getCompositionDurationInFrames,
} from '@/lib/editor/composition';
import type { EditorComposition as EditorCompositionType } from '@/lib/editor/types';

interface EditorPageClientProps {
  initialAssets: string[];
}

export function EditorPageClient({ initialAssets }: EditorPageClientProps) {
  const [composition, setComposition] = useState<EditorCompositionType>(() =>
    createCompositionFromLaunchContext({ assetPaths: initialAssets }),
  );
  const [aspectPreset, setAspectPreset] = useState<AspectPresetId>('landscape');
  const [isRendering, setIsRendering] = useState(false);
  const [renderedPath, setRenderedPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setComposition(
      createCompositionFromLaunchContext(
        { assetPaths: initialAssets },
        aspectPreset,
      ),
    );
  }, [initialAssets, aspectPreset]);

  const durationInFrames = useMemo(
    () => getCompositionDurationInFrames(composition),
    [composition],
  );

  function moveItem(index: number, direction: -1 | 1) {
    setComposition((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.items.length) return current;

      const items = [...current.items];
      const [item] = items.splice(index, 1);
      items.splice(nextIndex, 0, item);

      return { ...current, items };
    });
  }

  function updateDuration(index: number, seconds: number) {
    setComposition((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              durationInFrames: Math.max(30, Math.round(seconds * current.fps)),
            }
          : item,
      ),
    }));
  }

  function removeItem(index: number) {
    setComposition((current) => ({
      ...current,
      items: current.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function addAssetFromPrompt() {
    const input = window.prompt(
      'Paste a gallery asset path, for example "studio/output/file.jpg"',
    );
    if (!input) return;

    setComposition((current) => ({
      ...current,
      items: [...current.items, createTimelineItem(input)],
    }));
  }

  async function handleRender() {
    setIsRendering(true);
    setError(null);
    setRenderedPath(null);

    try {
      const response = await fetch('/api/editor/render', {
        body: JSON.stringify({ composition }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error || 'Failed to render composition');
      }

      setRenderedPath(body.path);
    } catch (renderError) {
      setError(
        renderError instanceof Error ? renderError.message : 'Render failed',
      );
    } finally {
      setIsRendering(false);
    }
  }

  return (
    <main className="mx-auto grid max-w-7xl gap-8 px-6 py-10 lg:grid-cols-[1.15fr_0.85fr]">
      <section className="rounded-[2rem] border border-[var(--border)] bg-[var(--card)] p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-[var(--muted-foreground)]">
              Remotion Editor
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">
              Arrange generated assets into a finished composition.
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={aspectPreset}
              onValueChange={(value) =>
                setAspectPreset(value as AspectPresetId)
              }
            >
              <SelectTrigger className="rounded-full border border-[var(--border)] bg-[var(--secondary)] px-4 py-2 text-sm outline-none transition focus:border-white/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ASPECT_PRESETS).map(([id, preset]) => (
                  <SelectItem key={id} value={id}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant={ButtonVariant.DEFAULT}
              withWrapper={false}
              onClick={handleRender}
              isDisabled={!composition.items.length || isRendering}
              className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
              icon={
                isRendering ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )
              }
            >
              Export video
            </Button>
          </div>
        </div>

        <div className="mt-8 overflow-hidden rounded-[2rem] border border-[var(--border)] bg-black/50">
          <Player
            component={EditorComposition}
            compositionWidth={composition.width}
            compositionHeight={composition.height}
            durationInFrames={durationInFrames}
            fps={composition.fps}
            controls
            loop
            autoPlay={false}
            inputProps={{ composition }}
            style={{
              aspectRatio: `${composition.width}/${composition.height}`,
              width: '100%',
            }}
          />
        </div>

        {renderedPath ? (
          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--secondary)] px-4 py-3">
            <span className="text-sm text-[var(--muted-foreground)]">
              Exported to Core gallery storage.
            </span>
            <Link
              href="/gallery"
              className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-white/90"
            >
              Open Gallery
            </Link>
            <a
              href={`/api/gallery/${renderedPath}`}
              className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--muted-foreground)] transition hover:border-white hover:text-[var(--foreground)]"
            >
              Download file
            </a>
          </div>
        ) : null}

        {error ? (
          <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        ) : null}
      </section>

      <aside className="space-y-5">
        <div className="rounded-[2rem] border border-[var(--border)] bg-[var(--card)] p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Timeline</h2>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                One main track, simple ordering, basic durations.
              </p>
            </div>
            <Button
              variant={ButtonVariant.OUTLINE}
              withWrapper={false}
              onClick={addAssetFromPrompt}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--muted-foreground)] transition hover:border-white hover:text-[var(--foreground)]"
              icon={<Plus className="h-4 w-4" />}
            >
              Add asset
            </Button>
          </div>

          <div className="mt-5 space-y-3">
            {composition.items.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-[var(--border)] bg-[var(--secondary)]/60 p-6 text-sm text-[var(--muted-foreground)]">
                Launch Editor with an `asset` query param from Studio or Gallery
                to seed the composition.
              </div>
            ) : (
              composition.items.map((item, index) => (
                <div
                  key={item.id}
                  className="rounded-3xl border border-[var(--border)] bg-[var(--secondary)] p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">
                        {item.path.split('/').pop()}
                      </p>
                      <p className="text-sm text-[var(--muted-foreground)]">
                        {item.mediaType}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant={ButtonVariant.OUTLINE}
                        withWrapper={false}
                        onClick={() => moveItem(index, -1)}
                        className="rounded-full border border-[var(--border)] p-2 text-[var(--muted-foreground)] transition hover:border-white hover:text-[var(--foreground)]"
                        icon={<ArrowUp className="h-4 w-4" />}
                      />
                      <Button
                        variant={ButtonVariant.OUTLINE}
                        withWrapper={false}
                        onClick={() => moveItem(index, 1)}
                        className="rounded-full border border-[var(--border)] p-2 text-[var(--muted-foreground)] transition hover:border-white hover:text-[var(--foreground)]"
                        icon={<ArrowDown className="h-4 w-4" />}
                      />
                      <Button
                        variant={ButtonVariant.UNSTYLED}
                        withWrapper={false}
                        onClick={() => removeItem(index)}
                        className="rounded-full border border-[var(--border)] p-2 text-red-300 transition hover:border-red-400/60"
                        icon={<Trash2 className="h-4 w-4" />}
                      />
                    </div>
                  </div>

                  <label className="mt-4 grid gap-2 text-sm text-[var(--muted-foreground)]">
                    Duration (seconds)
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      step={1}
                      value={Math.round(
                        item.durationInFrames / composition.fps,
                      )}
                      onChange={(event) =>
                        updateDuration(index, Number(event.target.value) || 1)
                      }
                      className="rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[var(--foreground)] outline-none transition focus:border-white/50"
                    />
                  </label>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-[2rem] border border-[var(--border)] bg-[var(--card)] p-6">
          <h2 className="text-lg font-semibold">Overlay</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            A single title overlay keeps v1 simple and render-safe.
          </p>
          <Textarea
            rows={4}
            value={composition.overlay?.text ?? ''}
            onChange={(event) =>
              setComposition((current) => ({
                ...current,
                overlay: event.target.value
                  ? {
                      id: current.overlay?.id ?? 'overlay-1',
                      text: event.target.value,
                    }
                  : undefined,
              }))
            }
            placeholder="Optional title overlay"
            className="mt-4 w-full rounded-3xl border border-[var(--border)] bg-[var(--secondary)] px-4 py-3 outline-none transition focus:border-white/50"
          />
        </div>
      </aside>
    </main>
  );
}
