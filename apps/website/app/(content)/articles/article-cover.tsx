import Image from 'next/image';
import { getArticleCoverPalette } from './article-cover.palette';

interface ArticleCoverProps {
  /** Uploaded artwork, when the article has any. */
  coverImageUrl?: string;
  /** Seeds the generated cover — the slug, so the look is stable per article. */
  seed: string;
  label: string;
  category?: string;
  /** Sizing and spacing; the cover owns only its own surface treatment. */
  className?: string;
  /** Suppresses the footer row on thumbnails, where it would just be noise. */
  isCompact?: boolean;
}

/**
 * The article hero. Uploaded artwork wins; otherwise the cover is generated
 * from the slug so every article opens on an image instead of straight prose.
 *
 * `gen-grain` goes on the container, never on an overlay: it declares
 * `position: relative`, which silently beats a `absolute inset-0` utility and
 * collapses the overlay to zero height. The vignette is drawn inline for the
 * same reason — `gen-vignette` would fight `gen-grain` over `::before`.
 */
export default function ArticleCover({
  category,
  className = 'mb-6 h-48 md:mb-8 md:h-64 lg:h-80',
  coverImageUrl,
  isCompact = false,
  label,
  seed,
}: ArticleCoverProps): React.ReactElement {
  if (coverImageUrl) {
    return (
      <div className={`relative overflow-hidden bg-muted ${className}`}>
        <Image
          src={coverImageUrl}
          alt={`${label} cover`}
          className="h-full w-full object-cover object-center"
          fill
          sizes="(max-width: 1024px) 100vw, 1280px"
          priority={!isCompact}
        />
      </div>
    );
  }

  const palette = getArticleCoverPalette(seed);

  return (
    <div
      className={`gen-grain overflow-hidden ${className}`}
      style={{
        background: `radial-gradient(120% 140% at 12% 0%, ${palette.to} 0%, ${palette.from} 52%, ${palette.base} 100%)`,
      }}
      aria-hidden="true"
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `repeating-linear-gradient(115deg, transparent 0 17px, ${palette.accent} 17px 18px)`,
          opacity: 0.22,
        }}
      />

      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 30% 20%, transparent 30%, rgba(0,0,0,0.55) 100%)',
        }}
      />

      <div
        className="absolute inset-x-0 bottom-0 h-px"
        style={{ background: palette.accent, opacity: 0.5 }}
      />

      {!isCompact && (
        <div className="absolute inset-0 flex items-end justify-between p-4 md:p-6">
          {category && (
            <span
              className="gen-label-sm uppercase tracking-[0.2em]"
              style={{ color: palette.accent }}
            >
              {category}
            </span>
          )}

          <span className="gen-label-sm uppercase tracking-[0.2em] text-surface/50">
            genfeed.ai
          </span>
        </div>
      )}
    </div>
  );
}
