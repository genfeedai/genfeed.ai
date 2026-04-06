'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { ProviderModel } from '@genfeedai/types';
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
          '/api/providers/models?provider=replicate',
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
      const response = await fetch(`/api/status/${predictionId}`, {
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
        mediaType === 'image' ? '/api/replicate/image' : '/api/replicate/video',
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

      const importResponse = await fetch('/api/studio/import', {
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
              <Button
                key={option}
                variant={
                  mediaType === option
                    ? ButtonVariant.DEFAULT
                    : ButtonVariant.SECONDARY
                }
                size={ButtonSize.SM}
                onClick={() => setMediaType(option)}
                className="rounded-full px-4 py-2 text-sm font-medium"
              >
                {option === 'image' ? 'Images' : 'Video'}
              </Button>
            ))}
          </div>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-[var(--muted-foreground)]">
              Prompt
            </span>
            <Textarea
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
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger className="rounded-2xl border border-[var(--border)] bg-[var(--secondary)] px-4 py-3 outline-none transition focus:border-white/50">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  {availableModels.map((candidate) => (
                    <SelectItem key={candidate.id} value={candidate.id}>
                      {candidate.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-[var(--muted-foreground)]">
                Aspect ratio
              </span>
              <Select value={aspectRatio} onValueChange={setAspectRatio}>
                <SelectTrigger className="rounded-2xl border border-[var(--border)] bg-[var(--secondary)] px-4 py-3 outline-none transition focus:border-white/50">
                  <SelectValue placeholder="Select ratio" />
                </SelectTrigger>
                <SelectContent>
                  {aspectChoices.map((choice) => (
                    <SelectItem key={choice} value={choice}>
                      {choice}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-medium text-[var(--muted-foreground)]">
                Count
              </span>
              <Input
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
              <Input
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
            <Button
              variant={ButtonVariant.DEFAULT}
              isDisabled={!prompt.trim() || !model || isSubmitting}
              isLoading={isSubmitting}
              onClick={handleGenerate}
              className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold"
              icon={<Sparkles className="h-4 w-4" />}
            >
              Generate
            </Button>
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
                      <img
                        src={`/api/gallery/${result.path}`}
                        alt={result.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <video
                        src={`/api/gallery/${result.path}`}
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
