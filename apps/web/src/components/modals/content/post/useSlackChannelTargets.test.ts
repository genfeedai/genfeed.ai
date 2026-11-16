import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSlackChannelTargets } from '@/components/modals/content/post/useSlackChannelTargets';

const slackAccount = { id: 'cred-slack', platform: 'slack' };

describe('useSlackChannelTargets', () => {
  it('sends the chosen channel with a Slack post', () => {
    const { result } = renderHook(() => useSlackChannelTargets(0));

    act(() => result.current.setChannel('cred-slack', 'C01'));

    expect(result.current.getTargetSettings(slackAccount)).toEqual({
      targetSettings: { channelId: 'C01' },
    });
  });

  it('adds nothing for a Slack account with no channel chosen, or another platform', () => {
    const { result } = renderHook(() => useSlackChannelTargets(0));

    act(() => result.current.setChannel('cred-x', 'C01'));

    expect(result.current.getTargetSettings(slackAccount)).toEqual({});
    expect(
      result.current.getTargetSettings({ id: 'cred-x', platform: 'twitter' }),
    ).toEqual({});
    expect(result.current.getTargetSettings(null)).toEqual({});
  });

  it('forgets the channel when the composer is reopened', () => {
    const { result, rerender } = renderHook(
      ({ openVersion }) => useSlackChannelTargets(openVersion),
      { initialProps: { openVersion: 0 } },
    );
    act(() => result.current.setChannel('cred-slack', 'C01'));

    rerender({ openVersion: 1 });

    expect(result.current.channelIds).toEqual({});
    expect(result.current.getTargetSettings(slackAccount)).toEqual({});
  });
});
