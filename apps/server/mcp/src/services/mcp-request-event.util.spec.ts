import {
  describeMcpRequest,
  describeToolArguments,
} from './mcp-request-event.util';

describe('describeMcpRequest', () => {
  it('names the tool of a tools/call and nothing from its arguments', () => {
    expect(
      describeMcpRequest({
        method: 'tools/call',
        params: { name: 'generate_media', arguments: { prompt: 'secret' } },
      }),
    ).toEqual({ mcp: { method: 'tools/call', tool_name: 'generate_media' } });
  });

  it('records the method alone for calls that name no tool', () => {
    expect(describeMcpRequest({ method: 'initialize', params: {} })).toEqual({
      mcp: { method: 'initialize' },
    });
    expect(
      describeMcpRequest({
        method: 'resources/read',
        params: { uri: 'genfeed://brand/secret' },
      }),
    ).toEqual({ mcp: { method: 'resources/read' } });
  });

  it('records the tools of a batch', () => {
    expect(
      describeMcpRequest([
        { method: 'tools/call', params: { name: 'a_tool' } },
        { method: 'tools/call', params: { name: 'b_tool' } },
        { method: 'tools/list' },
      ]),
    ).toEqual({
      mcp: {
        batch_size: 3,
        method: 'batch',
        tool_names: ['a_tool', 'b_tool'],
      },
    });
  });

  it('records nothing for a body that is not a call', () => {
    expect(describeMcpRequest(undefined)).toEqual({});
    expect(describeMcpRequest('text')).toEqual({});
    expect(describeMcpRequest({ params: {} })).toEqual({});
  });
});

describe('describeToolArguments', () => {
  it('keeps the argument names and drops every value', () => {
    const described = describeToolArguments({
      brandId: 'brand-123',
      prompt: 'a secret prompt',
    });

    expect(described).toEqual({ argumentKeys: ['brandId', 'prompt'] });
    expect(JSON.stringify(described)).not.toContain('secret');
    expect(JSON.stringify(described)).not.toContain('brand-123');
  });

  it('gives no keys for arguments that are not an object', () => {
    expect(describeToolArguments(undefined)).toEqual({ argumentKeys: [] });
    expect(describeToolArguments(['x'])).toEqual({ argumentKeys: [] });
  });
});
