'use client';

import type { XArticleTypeSelectorProps } from '@props/content/x-article.props';
import Card from '@ui/card/Card';
import { HiDocumentText, HiNewspaper } from 'react-icons/hi2';

export default function ArticleTypeSelector({
  onSelect,
}: XArticleTypeSelectorProps) {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8 text-center">
        <h2 className="text-2xl font-bold">Create New Article</h2>
        <p className="mt-2 text-sm text-foreground/60">
          Choose the type of article you want to create
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Card
          icon={HiDocumentText}
          label="Quick Article"
          description="Write a standard article with a rich text editor. Best for short posts, announcements, and general content."
          onClick={() => onSelect('quick')}
        />

        <Card
          icon={HiNewspaper}
          label="X Article"
          description="Generate a long-form, structured article with AI. Includes sections, pull quotes, and a header image."
          onClick={() => onSelect('x-article')}
        />
      </div>
    </div>
  );
}
