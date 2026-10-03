import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const MIGRATIONS = 'packages/prisma/prisma/migrations/';
const SCHEMA = 'packages/prisma/prisma/schema.prisma';
const RELEASE = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

// Tokenize rather than regex-matching raw SQL: comments/literals cannot hide
// operations or invent them, and PostgreSQL identifiers may be quoted.
export function sqlTokens(sql) {
  const tokens = [];
  const comments = [];
  for (let i = 0; i < sql.length; ) {
    const rest = sql.slice(i);
    if (/^\s/.test(rest)) {
      i++;
      continue;
    }
    if (rest.startsWith('--')) {
      const end = sql.indexOf('\n', i);
      comments.push(sql.slice(i, end < 0 ? sql.length : end));
      i = end < 0 ? sql.length : end;
      continue;
    }
    if (rest.startsWith('/*')) {
      let depth = 1;
      i += 2;
      while (depth && i < sql.length) {
        if (sql.slice(i, i + 2) === '/*') {
          depth++;
          i += 2;
        } else if (sql.slice(i, i + 2) === '*/') {
          depth--;
          i += 2;
        } else i++;
      }
      if (depth) throw new Error('Unterminated SQL comment');
      continue;
    }
    const dollar = rest.match(/^\$(?:[A-Za-z_][\w]*)?\$/)?.[0];
    if (dollar) {
      const end = sql.indexOf(dollar, i + dollar.length);
      if (end < 0) throw new Error('Unterminated dollar-quoted SQL');
      // PL/pgSQL can execute static DDL in a DO body.
      const body = sqlTokens(sql.slice(i + dollar.length, end));
      tokens.push(...body.tokens);
      i = end + dollar.length;
      continue;
    }
    if (rest[0] === "'" || rest[0] === '"') {
      const quote = rest[0];
      let value = '';
      let closed = false;
      i++;
      while (i < sql.length) {
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) {
            value += quote;
            i += 2;
            continue;
          }
          i++;
          closed = true;
          break;
        }
        if (quote === "'" && sql[i] === '\\') {
          value += sql.slice(i, i + 2);
          i += 2;
        } else value += sql[i++];
      }
      if (!closed) throw new Error('Unterminated SQL quote');
      tokens.push({ value, kind: quote === '"' ? 'identifier' : 'literal' });
      continue;
    }
    const word = rest.match(/^[A-Za-z_][A-Za-z0-9_$]*/)?.[0];
    tokens.push({ value: word ?? rest[0], kind: word ? 'word' : 'symbol' });
    i += word?.length ?? 1;
  }
  return { tokens, comments };
}

export function destructiveOperations(sql) {
  const { tokens, comments } = sqlTokens(sql);
  const keyword = (i, value) =>
    tokens[i]?.kind === 'word' && tokens[i].value.toUpperCase() === value;
  const identifier = (i) => {
    const token = tokens[i];
    if (!token || !['word', 'identifier'].includes(token.kind))
      throw new Error('Unsupported destructive SQL identifier');
    return token.kind === 'word' ? token.value.toLowerCase() : token.value;
  };
  const tableAt = (index) => {
    let table = identifier(index++);
    if (tokens[index]?.value === '.') {
      if (table !== 'public')
        throw new Error('Contract guard supports only the public schema');
      table = identifier(++index);
      index++;
    }
    return { table, index };
  };
  const operations = [];
  if (
    tokens.some(
      (token) =>
        token.kind === 'word' && token.value.toUpperCase() === 'EXECUTE',
    )
  ) {
    // Dynamic SQL can concatenate identifiers/keywords. Require a static
    // contract migration that this guard and reviewers can prove safe.
    throw new Error(
      'Dynamic EXECUTE migrations require static SQL for compatibility review',
    );
  }
  for (let i = 0; i < tokens.length; i++) {
    if (keyword(i, 'DROP') && keyword(i + 1, 'TABLE')) {
      let index = i + 2;
      if (keyword(index, 'IF') && keyword(index + 1, 'EXISTS')) index += 2;
      do {
        const parsed = tableAt(index);
        operations.push({ type: 'drop-table', table: parsed.table });
        index = parsed.index;
        if (tokens[index]?.value !== ',') break;
        index++;
      } while (index < tokens.length);
    }
    if (!keyword(i, 'ALTER') || !keyword(i + 1, 'TABLE')) continue;
    let index = i + 2;
    if (keyword(index, 'IF') && keyword(index + 1, 'EXISTS')) index += 2;
    if (keyword(index, 'ONLY')) index++;
    const parsed = tableAt(index);
    const table = parsed.table;
    const start = parsed.index + (tokens[parsed.index]?.value === '*' ? 1 : 0);
    for (
      let j = start;
      j < tokens.length &&
      !(tokens[j].kind === 'symbol' && tokens[j].value === ';');
      j++
    ) {
      const isAction =
        j === start ||
        (tokens[j - 1]?.kind === 'symbol' && tokens[j - 1]?.value === ',');
      if (
        isAction &&
        keyword(j, 'DROP') &&
        !['CONSTRAINT', 'IDENTITY', 'EXPRESSION'].some((word) =>
          keyword(j + 1, word),
        )
      ) {
        let column = j + 1;
        if (keyword(column, 'COLUMN')) column++;
        if (keyword(column, 'IF') && keyword(column + 1, 'EXISTS')) column += 2;
        operations.push({
          type: 'drop-column',
          table,
          column: identifier(column),
        });
      }
      if (isAction && keyword(j, 'ALTER')) {
        let column = j + 1;
        if (keyword(column, 'COLUMN')) column++;
        if (
          keyword(column + 1, 'SET') &&
          keyword(column + 2, 'NOT') &&
          keyword(column + 3, 'NULL')
        ) {
          operations.push({
            type: 'not-null',
            table,
            column: identifier(column),
          });
        }
      }
    }
  }
  const markers = comments.flatMap((comment) => {
    const match = comment.match(/^--\s*genfeed-contract-after:\s*(\S+)\s*$/);
    return match ? [match[1]] : [];
  });
  return { operations, markers };
}

export function prismaTables(schema) {
  const tables = new Map();
  const clean = schema
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  for (const model of clean.matchAll(
    /^\s*model\s+(\w+)\s*\{([\s\S]*?)^\s*\}/gm,
  )) {
    const body = model[2];
    if (/@@ignore\b/.test(body)) continue;
    const table = body.match(/@@map\("([^"]+)"\)/)?.[1] ?? model[1];
    const fields = new Map();
    for (const field of body.matchAll(
      /^\s*(\w+)\s+(\w+)(\?|\[\])?([^\n]*)/gm,
    )) {
      if (/@ignore\b|@relation\b/.test(field[4])) continue;
      fields.set(field[4].match(/@map\("([^"]+)"\)/)?.[1] ?? field[1], {
        isOptional: field[3] === '?',
      });
    }
    tables.set(table, fields);
  }
  return tables;
}

export function validateContract(sql, releaseSchema) {
  const { operations, markers } = destructiveOperations(sql);
  if (!operations.length) return null;
  if (markers.length !== 1 || !RELEASE.test(markers[0])) {
    throw new Error(
      'Destructive SQL requires exactly one -- genfeed-contract-after: vX.Y.Z marker',
    );
  }
  if (releaseSchema !== undefined) {
    const tables = prismaTables(releaseSchema);
    for (const operation of operations) {
      const fields = tables.get(operation.table);
      const label = `${operation.table}${operation.column ? `.${operation.column}` : ''}`;
      if (
        operation.type === 'drop-table'
          ? fields
          : operation.type === 'drop-column'
            ? fields?.has(operation.column)
            : fields &&
              (!fields.has(operation.column) ||
                fields.get(operation.column).isOptional)
      ) {
        throw new Error(
          `${markers[0]} Prisma client is incompatible with ${operation.type} ${label}`,
        );
      }
    }
  }
  return markers[0];
}

export function checkMigrations({
  base,
  cwd = process.cwd(),
  git = execFileSync,
  read = readFileSync,
  release = execFileSync,
  repository = 'genfeedai/genfeed.ai',
}) {
  const runGit = (args) => git('git', args, { cwd, encoding: 'utf8' }).trim();
  const baseSha = runGit(['rev-parse', '--verify', `${base}^{commit}`]);
  if (!/^[0-9a-f]{40}$/.test(baseSha))
    throw new Error('Invalid migration diff base');
  const changed = runGit([
    'diff',
    '--name-status',
    '--no-renames',
    baseSha,
    'HEAD',
    '--',
    MIGRATIONS,
  ]);
  const verified = new Map();
  for (const row of changed.split('\n').filter(Boolean)) {
    const [status, file] = row.split('\t');
    if (!file?.endsWith('/migration.sql')) continue;
    if (status !== 'A')
      throw new Error(`Applied migration SQL is immutable: ${file}`);
    const sql = read(`${cwd}/${file}`, 'utf8');
    const tag = validateContract(sql);
    if (!tag) continue;
    if (!verified.has(tag)) {
      const published = JSON.parse(
        release('gh', ['api', `repos/${repository}/releases/tags/${tag}`], {
          cwd,
          encoding: 'utf8',
        }),
      );
      if (
        published.draft ||
        published.prerelease ||
        published.tag_name !== tag ||
        !published.published_at
      )
        throw new Error(`${tag} must be a published stable release`);
      runGit([
        'merge-base',
        '--is-ancestor',
        `refs/tags/${tag}^{commit}`,
        baseSha,
      ]);
      verified.set(tag, runGit(['show', `refs/tags/${tag}:${SCHEMA}`]));
    }
    validateContract(sql, verified.get(tag));
  }
  return changed.split('\n').filter(Boolean).length;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { values } = parseArgs({ options: { base: { type: 'string' } } });
  try {
    if (!values.base)
      throw new Error(
        '--base is required; never retroactively rewrite migration history',
      );
    const count = checkMigrations({ base: values.base });
    process.stdout.write(
      `Migration safety verified (${count} changed files).\n`,
    );
  } catch (error) {
    process.stderr.write(`Migration safety: ${error.message}\n`);
    process.exitCode = 1;
  }
}
