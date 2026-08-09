import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockDel = vi.fn();
const mockFlattenCollection = vi.fn();
const mockFlattenSingle = vi.fn();

vi.mock('../../src/api/client', () => ({
  del: (...args: unknown[]) => mockDel(...args),
  get: (...args: unknown[]) => mockGet(...args),
  post: (...args: unknown[]) => mockPost(...args),
}));

vi.mock('../../src/api/json-api', () => ({
  flattenCollection: (...args: unknown[]) => mockFlattenCollection(...args),
  flattenSingle: (...args: unknown[]) => mockFlattenSingle(...args),
}));

describe('api/templates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists templates without params', async () => {
    mockGet.mockResolvedValue({ data: [] });
    mockFlattenCollection.mockReturnValue([]);

    const { listTemplates } = await import('../../src/api/templates');
    await listTemplates();

    expect(mockGet).toHaveBeenCalledWith('/templates');
  });

  it('lists templates with all filters', async () => {
    mockGet.mockResolvedValue({ data: [] });
    mockFlattenCollection.mockReturnValue([]);

    const { listTemplates } = await import('../../src/api/templates');
    await listTemplates({ category: 'social', limit: 3, purpose: 'launch', sort: 'popular' });

    expect(mockGet).toHaveBeenCalledWith(
      '/templates?purpose=launch&category=social&limit=3&sort=popular'
    );
  });

  it('gets a single template by id', async () => {
    mockGet.mockResolvedValue({ data: { id: 'tpl-1' } });
    mockFlattenSingle.mockReturnValue({ id: 'tpl-1', label: 'Launch post' });

    const { getTemplate } = await import('../../src/api/templates');
    const result = await getTemplate('tpl-1');

    expect(mockGet).toHaveBeenCalledWith('/templates/tpl-1');
    expect(result.label).toBe('Launch post');
  });

  it('creates a template', async () => {
    mockPost.mockResolvedValue({ data: { id: 'tpl-2' } });
    mockFlattenSingle.mockReturnValue({ id: 'tpl-2', label: 'New' });

    const { createTemplate } = await import('../../src/api/templates');
    const result = await createTemplate({ content: 'Hello {{name}}', label: 'New' });

    expect(mockPost).toHaveBeenCalledWith('/templates', {
      content: 'Hello {{name}}',
      label: 'New',
    });
    expect(result.id).toBe('tpl-2');
  });

  it('uses a template with variables', async () => {
    mockPost.mockResolvedValue({ data: { id: 'tpl-1' } });
    mockFlattenSingle.mockReturnValue({ content: 'Hello world' });

    const { useTemplate } = await import('../../src/api/templates');
    const result = await useTemplate('tpl-1', { variables: { name: 'world' } });

    expect(mockPost).toHaveBeenCalledWith('/templates/tpl-1/use', {
      variables: { name: 'world' },
    });
    expect(result.content).toBe('Hello world');
  });

  it('fetches popular templates with the default limit', async () => {
    mockGet.mockResolvedValue({ data: [] });
    mockFlattenCollection.mockReturnValue([{ id: 'tpl-1' }]);

    const { getPopularTemplates } = await import('../../src/api/templates');
    const result = await getPopularTemplates();

    expect(mockGet).toHaveBeenCalledWith('/templates?sort=popular&limit=10');
    expect(result).toHaveLength(1);
  });

  it('suggests templates for a prompt', async () => {
    mockPost.mockResolvedValue({ data: [] });
    mockFlattenCollection.mockReturnValue([{ id: 'tpl-3', label: 'Suggested' }]);

    const { suggestTemplates } = await import('../../src/api/templates');
    const result = await suggestTemplates('announce a product');

    expect(mockPost).toHaveBeenCalledWith('/templates/suggest', { prompt: 'announce a product' });
    expect(result[0].id).toBe('tpl-3');
  });

  it('deletes a template', async () => {
    mockDel.mockResolvedValue(undefined);

    const { deleteTemplate } = await import('../../src/api/templates');
    await deleteTemplate('tpl-1');

    expect(mockDel).toHaveBeenCalledWith('/templates/tpl-1');
  });
});
