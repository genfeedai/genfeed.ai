import { getToolByName } from '@genfeedai/actions';
import type { ClientService } from '@mcp/services/client.service';
import { models3dToolSchemas } from '@mcp/tools/models3d.schemas';
import {
  handleModels3dTool,
  MODELS3D_TOOL_NAMES,
} from '@mcp/tools/models3d.tool';
import { describe, expect, it, vi } from 'vitest';

describe('3D render MCP tools', () => {
  it('registers exactly the two tools, in their own toolset', () => {
    expect([...MODELS3D_TOOL_NAMES].sort()).toEqual([
      'get_model3d',
      'render_3d',
    ]);
    expect(getToolByName('render_3d')).toMatchObject({
      mutationPolicy: 'approval-required',
      surfaces: { agent: false, mcp: true },
      toolset: 'models3d',
    });
    expect(getToolByName('get_model3d')).toMatchObject({
      creditCost: 0,
      toolset: 'models3d',
    });
    expect(getToolByName('get_model3d')?.annotations).toMatchObject({
      readOnlyHint: true,
    });
    expect(getToolByName('render_3d')?.annotations).toMatchObject({
      readOnlyHint: false,
    });
  });

  it('validates input strictly', () => {
    const { get_model3d: get, render_3d: render } = models3dToolSchemas;
    expect(render.safeParse({ imageUrl: 'not a url' }).success).toBe(false);
    expect(render.safeParse({}).success).toBe(false);
    expect(
      render.safeParse({ extra: 1, imageUrl: 'https://example.com/a.png' })
        .success,
    ).toBe(false);
    expect(
      render.safeParse({ imageUrl: 'https://example.com/a.png', prompt: ' ' })
        .success,
    ).toBe(false);
    expect(
      render.safeParse({
        build: true,
        imageUrl: 'https://example.com/a.png',
        prompt: 'a house',
      }).success,
    ).toBe(true);
    expect(get.safeParse({ id: '../etc' }).success).toBe(false);
    expect(get.safeParse({ id: '' }).success).toBe(false);
    expect(get.safeParse({ id: 'abc123' }).success).toBe(true);
  });

  it('dispatches render_3d and get_model3d to the client', async () => {
    const render3d = vi.fn().mockResolvedValue({ id: 'm-1' });
    const getModel3d = vi
      .fn()
      .mockResolvedValue({ id: 'm-1', status: 'ready' });
    const client = { getModel3d, render3d } as unknown as ClientService;

    const created = await handleModels3dTool(client, 'render_3d', {
      imageUrl: 'https://example.com/a.png',
    });
    const read = await handleModels3dTool(client, 'get_model3d', {
      id: 'm-1',
    });

    expect(render3d).toHaveBeenCalledWith({
      imageUrl: 'https://example.com/a.png',
    });
    expect(getModel3d).toHaveBeenCalledWith({ id: 'm-1' });
    expect(created.structuredContent).toEqual({ data: { id: 'm-1' } });
    expect(read.structuredContent).toEqual({
      data: { id: 'm-1', status: 'ready' },
    });
  });

  it('rejects bad arguments before calling the client and unknown tools', async () => {
    const render3d = vi.fn();
    const client = { render3d } as unknown as ClientService;

    await expect(
      handleModels3dTool(client, 'render_3d', { imageUrl: 'nope' }),
    ).rejects.toThrow();
    await expect(handleModels3dTool(client, 'nope', {})).rejects.toThrow(
      'Unknown 3D tool: nope',
    );
    expect(render3d).not.toHaveBeenCalled();
  });
});
