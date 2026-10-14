'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef } from 'react';
import 'swagger-ui-react/swagger-ui.css';
import type { SwaggerUIProps } from 'swagger-ui-react';

const SwaggerUIReact = dynamic<SwaggerUIProps>(
  () => import('swagger-ui-react').then((module) => module.default),
  {
    loading: () => (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        Loading API Documentation…
      </div>
    ),
    ssr: false,
  },
);

function demoteSwaggerDocumentTitle(root: HTMLElement): void {
  for (const heading of root.querySelectorAll('.info h1.title')) {
    const replacement = document.createElement('p');
    replacement.className = heading.className;
    replacement.replaceChildren(...Array.from(heading.childNodes));
    heading.replaceWith(replacement);
  }
}

export default function SwaggerUI() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    demoteSwaggerDocumentTitle(root);
    const observer = new MutationObserver(() => {
      demoteSwaggerDocumentTitle(root);
    });
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div className="swagger-wrapper" ref={rootRef}>
      <SwaggerUIReact url="https://api.genfeed.ai/v1/openapi.json" />
      <style>{`
        .swagger-wrapper {
          padding: 1rem;
        }

        .swagger-ui .topbar {
          display: none;
        }

        .swagger-ui .info {
          margin: 20px 0;
        }

        /* Dark mode support */
        .dark .swagger-ui {
          filter: invert(88%) hue-rotate(180deg);
        }

        .dark .swagger-ui .renderedMarkdown img,
        .dark .swagger-ui img {
          filter: invert(100%) hue-rotate(180deg);
        }
      `}</style>
    </div>
  );
}
