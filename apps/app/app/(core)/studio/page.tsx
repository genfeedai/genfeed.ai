'use client';

import type { ProviderModel } from '@genfeedai/types';
import {
  ArrowRight,
  Clapperboard,
  LoaderCircle,
  Sparkles,
  Wand2,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import type {
  StudioGenerationRequest,
  StudioGenerationResult,
  StudioMediaType,
} from '@/lib/studio/types';

const IMAGE_ASPECTS = ['1:1', '4:5', '16:9'];
const VIDEO_ASPECTS = ['16:9', '9:16', '1:1'];

function getMediaCapabilities(model: ProviderModel): StudioMediaType[] {
  const mediaTypes = new Set<StudioMediaType>();

  for (const capability of model.capabilities) {
    if (capability === 'text-to-image' || capability === 'image-to-image') {
      mediaTypes.add('image');
    }
    if (capability === 'text-to-video' || capability === 'image-to-video') {
      mediaTypes.add('video');
    }
  }

  return Array.from(mediaTypes);
}

export default function StudioPage() {
  const [models, setModels] = useState<ProviderModel[]>([]);
  const [mediaType, setMediaType] = useState<StudioMediaType>('image');
  const [model, setModel] = useState<string>('');
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [duration, setDuration] = useState(8);
  const [count, setCount] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<StudioGenerationResult[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadModels() {
      try {
        const response = await fetch(
          '/v1/core/providers/models?provider=replicate',
        );
        if (!response.ok) {
          throw new Error('Failed to load models');
        }

        const data = await response.json();
        const filtered = (data.models as ProviderModel[]).filter(
          (candidate) => getMediaCapabilities(candidate).length > 0,
        );

        if (cancelled) return;

        setModels(filtered);
        setModel((currentModel) => {
          if (currentModel) {
            return currentModel;
          }

          const firstImageModel = filtered.find((candidate) =>
            getMediaCapabilities(candidate).includes('image'),
          );

          return firstImageModel?.id ?? '';
        });
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Failed to load models',
          );
        }
      }
    }

    loadModels();
    return () => {
      cancelled = true;
    };
  }, []);

  const availableModels = useMemo(
    () =>
      models.filter((candidate) =>
        getMediaCapabilities(candidate).includes(mediaType),
      ),
    [mediaType, models],
  );

  useEffect(() => {
    if (!availableModels.length) return;
    if (!availableModels.some((candidate) => candidate.id === model)) {
      setModel(availableModels[0]?.id ?? '');
    }
    if (mediaType === 'video' && !VIDEO_ASPECTS.includes(aspectRatio)) {
      setAspectRatio('16:9');
    }
    if (mediaType === 'image' && !IMAGE_ASPECTS.includes(aspectRatio)) {
      setAspectRatio('1:1');
    }
  }, [availableModels, model, mediaType, aspectRatio]);

  async function pollPrediction(predictionId: string): Promise<string[]> {
    while (true) {
      const response = await fetch(`/v1/core/status/${predictionId}`, {
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error('Failed to check prediction status');
      }

      const data = await response.json();
      setStatus(data.status ?? 'processing');

      if (data.status === 'failed') {
        throw new Error(data.error || 'Generation failed');
      }

      if (data.status === 'succeeded') {
        if (!data.output) return [];
        return Array.isArray(data.output) ? data.output : [data.output];
      }

      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
  }

  async function handleGenerate() {
    setError(null);
    setStatus('starting');
    setIsSubmitting(true);

    const payload: StudioGenerationRequest = {
      aspectRatio,
      count,
      duration: mediaType === 'video' ? duration : undefined,
      mediaType,
      model,
      prompt,
    };

    try {
      const response = await fetch(
        mediaType === 'image'
          ? '/v1/core/replicate/image'
          : '/v1/core/replicate/video',
        {
          body: JSON.stringify({
            config: {
              aspectRatio: payload.aspectRatio,
              duration: payload.duration,
              model: payload.model,
            },
            inputs: { prompt: payload.prompt },
            nodeId: 'studio-generator',
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
      );

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || 'Generation request failed');
      }

      const generation = await response.json();
      const outputUrls = await pollPrediction(generation.predictionId);

      if (!outputUrls.length) {
        throw new Error('No assets were returned from Replicate');
      }

      const importResponse = await fetch('/v1/core/studio/import', {
        body: JSON.stringify({ urls: outputUrls.slice(0, payload.count) }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });

      if (!importResponse.ok) {
        const body = await importResponse.json().catch(() => null);
        throw new Error(body?.error || 'Failed to import generated assets');
      }

      const imported = await importResponse.json();
      setResults(imported.items as StudioGenerationResult[]);
      setStatus('succeeded');
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Generation failed',
      );
      setStatus('failed');
    } finally {
      setIsSubmitting(false);
    }
  }

  const aspectChoices = mediaType === 'image' ? IMAGE_ASPECTS : VIDEO_ASPECTS;

  return (
    <main className="mx-auto grid max-w-7xl gap-8 px-6 py-10 lg:grid-cols-[1.2fr_0.8fr]">
      <section className="rounded-[2rem] border border-[var(--border)] bg-[var(--card)] p-6">
        <div className="max-w-2xl">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-[var(--muted-foreground)]">
            Prompt-Bar Studio
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            Generate assets fast, then move straight into editing.
          </h1>
          <p className="mt-4 text-[var(--muted-foreground)]">
            Core Studio is Replicate-only. Pick a model, write the prompt,
            generate locally, and save the result into the Core gallery.
          </p>
        </div>

        <div className="mt-8 grid gap-6">
          <div className="flex flex-wrap gap-3">
            {(['image', 'video'] as StudioMediaType[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setMediaType(option)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  mediaType === option
                    ? 'bg-white text-black'
                    : 'bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}
              >
                {option === 'image' ? 'Images' : 'Video'}
              </button>
            ))}
          </div>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-[var(--muted-foreground)]">
              Prompt
            </span>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={6}
              placeholder="Describe the image or shot you want to generate."
              className="w-full rounded-3xl border border-[var(--border)] bg-[var(--secondary)] px-5 py-4 text-base outline-none transition focus:border-white/50"
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-medium text-[var(--muted-foreground)]">
                Model
              </span>
              <select
                value={model}
                onChange={(event) => setModel(event.target.value)}
                className="rounded-2xl border border-[var(--border)] bg-[var(--secondary)] px-4 py-3 outline-none transition focus:border-white/50"
              >
                {availableModels.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.displayName}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-[var(--muted-foreground)]">
                Aspect ratio
              </span>
              <select
                value={aspectRatio}
                onChange={(event) => setAspectRatio(event.target.value)}
                className="rounded-2xl border border-[var(--border)] bg-[var(--secondary)] px-4 py-3 outline-none transition focus:border-white/50"
              >
                {aspectChoices.map((choice) => (
                  <option key={choice} value={choice}>
                    {choice}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-medium text-[var(--muted-foreground)]">
                Count
              </span>
              <input
                type="number"
                min={1}
                max={4}
                value={count}
                onChange={(event) => setCount(Number(event.target.value) || 1)}
                className="rounded-2xl border border-[var(--border)] bg-[var(--secondary)] px-4 py-3 outline-none transition focus:border-white/50"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-[var(--muted-foreground)]">
                Duration
              </span>
              <input
                type="number"
                min={4}
                max={12}
                step={1}
                disabled={mediaType !== 'video'}
                value={duration}
                onChange={(event) =>
                  setDuration(Number(event.target.value) || 8)
                }
                className="rounded-2xl border border-[var(--border)] bg-[var(--secondary)] px-4 py-3 outline-none transition focus:border-white/50 disabled:opacity-50"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!prompt.trim() || !model || isSubmitting}
              onClick={handleGenerate}
              className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Generate
            </button>
            <Link
              href="/workflows/new"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-5 py-3 text-sm font-medium text-[var(--muted-foreground)] transition hover:border-white hover:text-[var(--foreground)]"
            >
              <Wand2 className="h-4 w-4" />
              Open Workflow Builder
            </Link>
            {status ? (
              <span className="text-sm text-[var(--muted-foreground)]">
                Status: {status}
              </span>
            ) : null}
          </div>

          {error ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          ) : null}
        </div>
      </section>

      <aside className="space-y-5">
        <div className="rounded-[2rem] border border-[var(--border)] bg-[var(--card)] p-6">
          <div className="flex items-center gap-2 text-sm uppercase tracking-[0.22em] text-[var(--muted-foreground)]">
            <Clapperboard className="h-4 w-4" />
            Recent outputs
          </div>
          <div className="mt-5 space-y-4">
            {results.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-[var(--border)] bg-[var(--secondary)]/60 p-6 text-sm text-[var(--muted-foreground)]">
                Generated assets land here. From here you can open them directly
                in Editor or review them in Gallery.
              </div>
            ) : (
              results.map((result) => (
                <article
                  key={result.path}
                  className="overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--secondary)]"
                >
                  <div className="aspect-video bg-black/40">
                    {result.mediaType === 'image' ? (
                      // biome-ignore lint/performance/noImgElement: gallery thumbnail
                      <img
                        src={`/v1/core/gallery/${result.path}`}
                        alt={result.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      // biome-ignore lint/a11y/useMediaCaption: user-generated content
                      <video
                        src={`/v1/core/gallery/${result.path}`}
                        className="h-full w-full object-cover"
                        controls
                      />
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div>
                      <p className="font-medium">{result.name}</p>
                      <p className="text-sm text-[var(--muted-foreground)]">
                        {result.mimeType}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Link
                        href={`/editor?asset=${encodeURIComponent(result.path)}`}
                        className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-white/90"
                      >
                        Edit
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                      <Link
                        href="/gallery"
                        className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--muted-foreground)] transition hover:border-white hover:text-[var(--foreground)]"
                      >
                        Gallery
                      </Link>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      </aside>
    </main>
  );
}
