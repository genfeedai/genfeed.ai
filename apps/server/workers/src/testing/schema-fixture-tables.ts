import { readFileSync } from 'node:fs';
import type { Pool } from 'pg';

/**
 * Creates the named Prisma models as plain tables (and every enum) inside the
 * connection's current schema, read from schema.prisma. Relations and foreign
 * keys are not created, so a spec seeds only the rows it asserts on.
 */
export async function createFixtureTables(
  pool: Pick<Pool, 'query'>,
  names: ReadonlySet<string>,
) {
  const quoted = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const literal = (value: unknown) =>
    `'${String(value).replaceAll("'", "''")}'`;
  const schema = readFileSync(
    new URL(
      '../../../../../packages/prisma/prisma/schema.prisma',
      import.meta.url,
    ),
    'utf8',
  );
  const enumerations = new Set<string>();
  for (const match of schema.matchAll(/^enum (\w+) \{([\s\S]*?)^\}/gm)) {
    enumerations.add(match[1]);
    const values = [
      ...match[2].matchAll(/^\s*(\w+)\s*(?:@map\("([^"]+)"\))?\s*$/gm),
    ].map((value) => literal(value[2] ?? value[1]));
    await pool.query(
      `CREATE TYPE ${quoted(match[1])} AS ENUM (${values.join(',')})`,
    );
  }
  const scalarTypes: Record<string, string> = {
    String: 'text',
    Boolean: 'boolean',
    Int: 'integer',
    BigInt: 'bigint',
    Float: 'double precision',
    Decimal: 'numeric',
    Json: 'jsonb',
    DateTime: 'timestamp(3)',
    Bytes: 'bytea',
  };
  for (const match of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    if (!names.has(match[1])) continue;
    const columns: string[] = [];
    for (const field of match[2].matchAll(
      /^\s*(\w+)\s+(\w+)(\[\]|\?)?([^\n]*)$/gm,
    )) {
      const [, name, kind, suffix, attributes] = field;
      const scalar = enumerations.has(kind) ? quoted(kind) : scalarTypes[kind];
      if (!scalar) continue; // relation fields are not persisted columns
      const type = `${scalar}${suffix === '[]' ? '[]' : ''}`;
      const defaultValue = attributes.match(
        /@default\(("(?:\\.|[^"\\])*"|true|false|-?[\d.]+|\w+)\)/,
      )?.[1];
      let defaultSql = suffix === '[]' ? ` DEFAULT ARRAY[]::${type}` : '';
      if (attributes.includes('@default(now())')) defaultSql = ' DEFAULT now()';
      else if (defaultValue) {
        const value: unknown = defaultValue.startsWith('"')
          ? JSON.parse(defaultValue)
          : defaultValue;
        defaultSql = ` DEFAULT ${['Boolean', 'Int', 'BigInt', 'Float', 'Decimal'].includes(kind) ? String(value) : literal(value)}${kind === 'Json' ? '::jsonb' : ''}`;
      }
      const column = attributes.match(/@map\("([^"]+)"\)/)?.[1] ?? name;
      columns.push(
        `${quoted(column)} ${type}${suffix !== '?' ? ' NOT NULL' : ''}${defaultSql}${attributes.includes('@id') ? ' PRIMARY KEY' : attributes.includes('@unique') ? ' UNIQUE' : ''}`,
      );
    }
    const table = match[2].match(/@@map\("([^"]+)"\)/)?.[1] ?? match[1];
    await pool.query(`CREATE TABLE ${quoted(table)} (${columns.join(',')})`);
    for (const unique of match[2].matchAll(/@@unique\(\[([^\]]+)\]/g))
      await pool.query(
        `CREATE UNIQUE INDEX ON ${quoted(table)} (${unique[1]
          .split(',')
          .map((name) => quoted(name.trim()))
          .join(',')})`,
      );
  }
}
