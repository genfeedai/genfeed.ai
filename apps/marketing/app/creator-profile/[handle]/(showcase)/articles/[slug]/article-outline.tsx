'use client';

import type { ArticleOutlineProps } from '@props/content/public-article.props';
import { useEffect, useState } from 'react';

/**
 * The reading band: a heading counts as the current section once it has
 * scrolled under the public topbar (h-20, plus the scroll-mt-24 gap) and until
 * it leaves the top third of the screen.
 */
const READING_BAND_MARGIN = '-96px 0px -66% 0px';

/**
 * The article's contents, parked beside the body. The section being read is
 * marked as the current location, so the reader always sees where they are.
 */
export default function ArticleOutline({
  sections,
}: ArticleOutlineProps): React.ReactElement | null {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (sections.length === 0 || typeof IntersectionObserver === 'undefined') {
      return;
    }

    const order = new Map(
      sections.map((section, index) => [section.id, index]),
    );
    const inBand = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            inBand.add(entry.target.id);
          } else {
            inBand.delete(entry.target.id);
          }
        }
        // Several short sections can share the band; the first one is the one
        // being read. An empty band keeps the last section until the next
        // heading arrives.
        const [first] = [...inBand].sort(
          (left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0),
        );
        if (first) {
          setActiveId(first);
        }
      },
      { rootMargin: READING_BAND_MARGIN },
    );

    for (const section of sections) {
      const heading = document.getElementById(section.id);
      if (heading) {
        observer.observe(heading);
      }
    }

    return () => observer.disconnect();
  }, [sections]);

  if (sections.length === 0) {
    return null;
  }

  return (
    <nav aria-label="On this page" className="space-y-3 text-sm">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-foreground/50">
        On this page
      </p>
      <ol className="space-y-2 border-l border-foreground/10">
        {sections.map((section) => {
          const isActive = section.id === activeId;
          return (
            <li
              className={section.level === 3 ? 'pl-6' : 'pl-3'}
              key={section.id}
            >
              <a
                aria-current={isActive ? 'location' : undefined}
                className={
                  isActive
                    ? 'block font-medium text-foreground'
                    : 'block text-foreground/60 hover:text-foreground'
                }
                href={`#${section.id}`}
              >
                {section.label}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
