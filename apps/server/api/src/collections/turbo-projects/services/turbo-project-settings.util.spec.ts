import {
  mergeTurboProjectSettings,
  parseTurboProjectSettings,
} from '@api/collections/turbo-projects/services/turbo-project-settings.util';

describe('Turbo project settings', () => {
  it('keeps valid idea and schedule choices and drops the rest', () => {
    expect(
      parseTurboProjectSettings({
        ideas: { angle: ' Summer ', count: 40, formats: ['image', 'gif'] },
        schedule: {
          targets: [
            {
              credentialId: 'credential-1',
              isSelected: false,
              platform: 'TikTok',
              scheduledDate: 'not-a-date',
            },
            { platform: 'instagram' },
          ],
          timezone: 'Europe/Paris',
        },
        unknown: true,
      }),
    ).toEqual({
      ideas: { angle: 'Summer', count: 9, formats: ['image'] },
      schedule: {
        targets: [
          {
            credentialId: 'credential-1',
            isSelected: false,
            platform: 'tiktok',
          },
        ],
        timezone: 'Europe/Paris',
      },
    });
  });

  it('replaces only the sections an update carries', () => {
    expect(
      mergeTurboProjectSettings(
        { ideas: { count: 6, formats: ['video'] } },
        { schedule: { targets: [] } },
      ),
    ).toEqual({
      ideas: { count: 6, formats: ['video'] },
      schedule: { targets: [] },
    });
  });
});
