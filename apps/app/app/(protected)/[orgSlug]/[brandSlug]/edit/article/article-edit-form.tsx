'use client';

import { ArticleCategory } from '@genfeedai/enums';
import type { ArticleFormState } from '@props/content/article-editor.props';
import Card from '@ui/card/Card';
import LazyRichTextEditor from '@ui/editors/LazyRichTextEditor';
import FormDropdown from '@ui/primitives/dropdown-field';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import type { ChangeEvent } from 'react';

const ARTICLE_CATEGORY_OPTIONS = Object.values(ArticleCategory)
  .filter((value) => value !== ArticleCategory.X_ARTICLE)
  .map((value) => ({
    key: value,
    label: value
      .split(/[-_]/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' '),
  }));

type ArticleEditFormProps = {
  form: ArticleFormState;
  setFormField: <K extends keyof ArticleFormState>(
    key: K,
    value: ArticleFormState[K],
  ) => void;
};

export default function ArticleEditForm({
  form,
  setFormField,
}: ArticleEditFormProps) {
  return (
    <>
      {/* Title */}
      <Card bodyClassName="space-y-4">
        <FormControl label="Title">
          <Input
            name="articleTitle"
            value={form.label}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setFormField('label', e.target.value)
            }
            placeholder="Enter article title"
          />
        </FormControl>

        <FormControl label="Slug">
          <Input
            name="articleSlug"
            value={form.slug}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setFormField('slug', e.target.value)
            }
            placeholder="article-url-slug"
          />
        </FormControl>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormControl label="Category">
            <FormDropdown
              name="articleCategory"
              value={form.category}
              options={ARTICLE_CATEGORY_OPTIONS}
              onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                setFormField('category', e.target.value as ArticleCategory)
              }
            />
          </FormControl>

          <FormControl label="Tags">
            <Input
              name="articleTags"
              value={form.tags}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setFormField('tags', e.target.value)
              }
              placeholder="tag1, tag2, tag3"
            />
          </FormControl>
        </div>

        <FormControl label="Summary">
          <Input
            name="articleSummary"
            value={form.summary}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setFormField('summary', e.target.value)
            }
            placeholder="Brief description of the article"
          />
        </FormControl>
      </Card>

      {/* Body Editor */}
      <Card>
        <LazyRichTextEditor
          value={form.content}
          onChange={(value: string) => setFormField('content', value)}
          placeholder="Start writing your article..."
          minHeight={{ desktop: 500, mobile: 300 }}
        />
      </Card>
    </>
  );
}
