/**
 * The most a transcript may differ from the script (word error rate, 0 to 1)
 * before an ad preset output is held for review. A speech model that hears a
 * clean take still drops or swaps the odd word, so a perfect score is not asked
 * for. Changing this is a product decision, not a per-deployment setting.
 */
export const AD_DIALOGUE_MAX_WORD_ERROR_RATE = 0.15;

export interface AdDialogueChangedWord {
  expected: string;
  actual: string;
}

export interface AdDialogueDiff {
  /** Words in the script after normalisation. */
  expectedWordCount: number;
  /** Words in the transcript after normalisation. */
  actualWordCount: number;
  /** (changed + removed + added) / expectedWordCount; 1 when the script is empty but words were spoken. */
  wordErrorRate: number;
  /** Spoken words the script does not have. */
  added: string[];
  /** Script words that were not spoken. */
  removed: string[];
  /** Script words replaced by another spoken word. */
  changed: AdDialogueChangedWord[];
}

const ONES: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};
const SCALES: Record<string, number> = {
  hundred: 100,
  thousand: 1000,
};

type NumberWordKind = 'ones' | 'teens' | 'tens' | 'hundred' | 'thousand';

const CONTINUES: Record<NumberWordKind, readonly NumberWordKind[]> = {
  hundred: ['tens', 'teens', 'ones', 'thousand'],
  ones: ['hundred', 'thousand'],
  teens: ['thousand'],
  tens: ['ones', 'thousand'],
  thousand: ['tens', 'teens', 'ones'],
};

function numberWordKind(word: string): NumberWordKind | null {
  if (word === 'zero') return null;
  if (word in ONES) return ONES[word] < 10 ? 'ones' : 'teens';
  if (word in TENS) return 'tens';
  if (word === 'hundred' || word === 'thousand') return word;
  return null;
}

/**
 * Folds a spoken number ("twenty five", "one hundred") into digits. Words that
 * do not extend the number before them start a new one, so "one two three"
 * stays three numbers rather than becoming six.
 */
function foldNumberWords(words: string[]): string[] {
  const folded: string[] = [];
  let total = 0;
  let current = 0;
  let last = null as NumberWordKind | null;
  const flush = () => {
    if (last !== null) folded.push(String(total + current));
    total = 0;
    current = 0;
    last = null;
  };
  for (const word of words) {
    const kind = numberWordKind(word);
    if (kind === null) {
      flush();
      folded.push(word === 'zero' ? '0' : word);
      continue;
    }
    if (last !== null && !CONTINUES[last].includes(kind)) flush();
    if (kind === 'ones' || kind === 'teens') current += ONES[word];
    else if (kind === 'tens') current += TENS[word];
    else if (kind === 'hundred') current = Math.max(current, 1) * 100;
    else {
      total += Math.max(current, 1) * SCALES[word];
      current = 0;
    }
    last = kind;
  }
  flush();
  return folded;
}

/**
 * Lower-cases, drops punctuation (apostrophes inside a word go, so "don't"
 * equals "dont"), removes thousands separators and reads number words as
 * digits, so "Twenty-five" and "25" compare equal.
 */
export function normalizeDialogueWords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/(\d),(?=\d{3}\b)/g, '$1')
    .replace(/['’`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((word) => word.length > 0);
  return foldNumberWords(words);
}

/** Word-level edit distance between the script and what was spoken. */
export function diffAdDialogue(
  expectedText: string,
  actualText: string,
): AdDialogueDiff {
  const expected = normalizeDialogueWords(expectedText);
  const actual = normalizeDialogueWords(actualText);
  const rows = expected.length + 1;
  const columns = actual.length + 1;
  const cost: number[][] = Array.from({ length: rows }, () =>
    new Array<number>(columns).fill(0),
  );
  for (let row = 0; row < rows; row += 1) cost[row][0] = row;
  for (let column = 0; column < columns; column += 1) cost[0][column] = column;
  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const isSame = expected[row - 1] === actual[column - 1];
      cost[row][column] = Math.min(
        cost[row - 1][column - 1] + (isSame ? 0 : 1),
        cost[row - 1][column] + 1,
        cost[row][column - 1] + 1,
      );
    }
  }

  const added: string[] = [];
  const removed: string[] = [];
  const changed: AdDialogueChangedWord[] = [];
  let row = expected.length;
  let column = actual.length;
  while (row > 0 || column > 0) {
    const isSame =
      row > 0 && column > 0 && expected[row - 1] === actual[column - 1];
    if (isSame && cost[row][column] === cost[row - 1][column - 1]) {
      row -= 1;
      column -= 1;
    } else if (
      row > 0 &&
      column > 0 &&
      cost[row][column] === cost[row - 1][column - 1] + 1
    ) {
      changed.unshift({
        actual: actual[column - 1],
        expected: expected[row - 1],
      });
      row -= 1;
      column -= 1;
    } else if (row > 0 && cost[row][column] === cost[row - 1][column] + 1) {
      removed.unshift(expected[row - 1]);
      row -= 1;
    } else {
      added.unshift(actual[column - 1]);
      column -= 1;
    }
  }

  const errors = added.length + removed.length + changed.length;
  let wordErrorRate = 1;
  if (expected.length > 0) wordErrorRate = errors / expected.length;
  else if (errors === 0) wordErrorRate = 0;
  return {
    actualWordCount: actual.length,
    added,
    changed,
    expectedWordCount: expected.length,
    removed,
    wordErrorRate,
  };
}

const LINE_BREAK_PATTERN = /\r?\n/;
const SRT_CUE_NUMBER_PATTERN = /^\d+$/;
const SRT_TIMESTAMP_PATTERN = /^\d{2}:\d{2}:\d{2}[,.]\d{3}\s+-->\s+/;

/** The spoken text of an SRT transcript: cue numbers and timestamps removed. */
export function srtToText(srt: string): string {
  return srt
    .split(LINE_BREAK_PATTERN)
    .filter(
      (line) =>
        line.trim().length > 0 &&
        !SRT_CUE_NUMBER_PATTERN.test(line.trim()) &&
        !SRT_TIMESTAMP_PATTERN.test(line.trim()),
    )
    .join(' ');
}
