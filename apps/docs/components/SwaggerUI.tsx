'use client';

import dynamic from 'next/dynamic';
import 'swagger-ui-react/swagger-ui.css';

const SwaggerUIReact = dynamic<{ url: string }>(
  () => import('swagger-ui-react') as any,
  {
    loading: () => (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        Loading API Documentation...
      </div>
    ),
    ssr: false,
  },
);

export default function SwaggerUI() {
  return (
    <div className="swagger-wrapper">
      <SwaggerUIReact url="https://api.genfeed.ai/v1/openapi.json" />
      <style jsx global>{`
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
