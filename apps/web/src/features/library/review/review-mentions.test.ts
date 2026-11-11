import {
  activeMentionQuery,
  insertMention,
  matchMentionable,
  mentionedUserIds,
  mentionToken,
  splitMentions,
} from './review-mentions';

const team = [
  { name: 'Ana Costa', userId: 'user_ana' },
  { name: 'Marco Rossi', userId: 'user_marco' },
  { name: 'Marco Polo', userId: 'user_polo' },
];

describe('mentionToken', () => {
  it('uses the first name when it is unique', () => {
    expect(mentionToken(team[0], team)).toBe('@Ana');
  });

  it('uses the whole name when another teammate shares the first name', () => {
    expect(mentionToken(team[1], team)).toBe('@MarcoRossi');
  });
});

describe('activeMentionQuery', () => {
  it.each([
    ['Hi @', ''],
    ['Hi @Ma', 'Ma'],
    ['Hi @Marco ', null],
    ['No tag here', null],
  ])('reads %j as %j', (text, expected) => {
    expect(activeMentionQuery(text)).toBe(expected);
  });
});

describe('matchMentionable', () => {
  it('matches the start of the first or last name, ignoring case', () => {
    expect(matchMentionable(team, 'ro').map((p) => p.userId)).toEqual([
      'user_marco',
    ]);
    expect(matchMentionable(team, 'MA').map((p) => p.userId)).toEqual([
      'user_marco',
      'user_polo',
    ]);
  });

  it('offers everyone for a bare @', () => {
    expect(matchMentionable(team, '')).toHaveLength(3);
  });
});

describe('insertMention', () => {
  it('replaces the typed fragment with the chosen tag', () => {
    expect(insertMention('Can you check @Ma', '@Ana')).toBe(
      'Can you check @Ana ',
    );
  });
});

describe('mentionedUserIds', () => {
  const picked = new Map([
    ['user_ana', '@Ana'],
    ['user_marco', '@MarcoRossi'],
  ]);

  it('sends only the teammates whose tag is still in the text', () => {
    expect(mentionedUserIds('Hi @Ana, thanks', picked)).toEqual(['user_ana']);
  });

  it('sends nothing for a message without tags', () => {
    expect(mentionedUserIds('Looks good', picked)).toEqual([]);
  });

  it('matches a tag whatever its case', () => {
    expect(mentionedUserIds('hi @marcorossi', picked)).toEqual(['user_marco']);
  });
});

describe('splitMentions', () => {
  it('separates tags from plain text', () => {
    expect(splitMentions('Claim is fine. @Marco can you confirm?')).toEqual([
      { isMention: false, text: 'Claim is fine. ' },
      { isMention: true, text: '@Marco' },
      { isMention: false, text: ' can you confirm?' },
    ]);
  });
});
