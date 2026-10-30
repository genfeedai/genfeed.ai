import type { ArticleFormState } from '@props/content/article-editor.props';

export type ArticleEditFormProps = {
  form: ArticleFormState;
  setFormField: <K extends keyof ArticleFormState>(
    key: K,
    value: ArticleFormState[K],
  ) => void;
};
