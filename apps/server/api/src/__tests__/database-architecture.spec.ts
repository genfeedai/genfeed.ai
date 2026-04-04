/**
 * Database Architecture Validation Tests
 *
 * Static analysis tests that enforce multi-database architecture rules:
 * 1. No hardcoded connection name strings — use DB_CONNECTIONS.* constants
 * 2. DB_CONNECTIONS completeness — all connections registered in app.module.ts
 * 3. Connection name consistency — workers mirrors API connections
 */
import fs from 'node:fs';
import path from 'node:path';
import { findFiles } from '@api/__tests__/helpers/module-parser';
import { DB_CONNECTIONS } from '@api/constants/database.constants';

const API_SRC = path.resolve(__dirname, '..');
const WORKERS_SRC = path.resolve(__dirname, '../../../workers/src');
const SERVER_SRC = path.resolve(__dirname, '../../..');

describe('Database Architecture', () => {
  const connectionValues = Object.values(DB_CONNECTIONS);

  describe('No hardcoded connection names in forFeature calls', () => {
    it('should use DB_CONNECTIONS.* constants, not string literals', () => {
      const moduleFiles = findFiles(SERVER_SRC, /\.module\.ts$/);
      const violations: string[] = [];

      // Match: forFeature([...], '<conn>') or forFeatureAsync([...], '<conn>')
      const hardcodedPattern = new RegExp(
        `forFeature(?:Async)?\\([^)]*,\\s*['"](${connectionValues.join('|')})['"]`,
        'g',
      );

      for (const file of moduleFiles) {
        const content = fs.readFileSync(file, 'utf8');
        const matches = content.match(hardcodedPattern);
        if (matches) {
          const relativePath = path.relative(SERVER_SRC, file);
          violations.push(`${relativePath}: ${matches.join(', ')}`);
        }
      }

      expect(violations).toEqual([]);
    });

    it('should not hardcode connectionName in forRootAsync', () => {
      const moduleFiles = findFiles(SERVER_SRC, /\.module\.ts$/);
      const violations: string[] = [];

      // Match: connectionName: '<name>' instead of connectionName: DB_CONNECTIONS.*
      const hardcodedPattern = new RegExp(
        `connectionName:\\s*['"](${connectionValues.join('|')})['"]`,
        'g',
      );

      for (const file of moduleFiles) {
        const content = fs.readFileSync(file, 'utf8');
        const matches = content.match(hardcodedPattern);
        if (matches) {
          const relativePath = path.relative(SERVER_SRC, file);
          violations.push(`${relativePath}: ${matches.join(', ')}`);
        }
      }

      expect(violations).toEqual([]);
    });
  });

  describe('DB_CONNECTIONS completeness', () => {
    it('should register all defined connections in API app.module.ts', () => {
      const appModulePath = path.join(API_SRC, 'app.module.ts');
      const content = fs.readFileSync(appModulePath, 'utf8');

      // Extract connection names from forRootAsync connectionName fields
      const connectionNamePattern = /connectionName:\s*DB_CONNECTIONS\.(\w+)/g;
      const registeredConnections = new Set<string>();

      let match = connectionNamePattern.exec(content);
      while (match !== null) {
        registeredConnections.add(match[1]);
        match = connectionNamePattern.exec(content);
      }

      // Default (unnamed) connection uses dbName: DB_CONNECTIONS.CLOUD
      if (content.includes('dbName: DB_CONNECTIONS.CLOUD')) {
        registeredConnections.add('CLOUD');
      }

      const definedKeys = Object.keys(DB_CONNECTIONS).sort();
      const registeredKeys = [...registeredConnections].sort();

      expect(registeredKeys).toEqual(definedKeys);
    });
  });

  describe('Connection name consistency between API and Workers', () => {
    it('should register the same connections in workers as in API', () => {
      const apiModulePath = path.join(API_SRC, 'app.module.ts');
      const workersModulePath = path.join(WORKERS_SRC, 'app.module.ts');

      const apiContent = fs.readFileSync(apiModulePath, 'utf8');
      const workersContent = fs.readFileSync(workersModulePath, 'utf8');

      const extractConnections = (content: string): Set<string> => {
        const connections = new Set<string>();
        const pattern = /DB_CONNECTIONS\.(\w+)/g;
        let connMatch = pattern.exec(content);
        while (connMatch !== null) {
          connections.add(connMatch[1]);
          connMatch = pattern.exec(content);
        }
        return connections;
      };

      const apiConnections = extractConnections(apiContent);
      const workersConnections = extractConnections(workersContent);

      // Workers must register every connection that API registers
      const missingInWorkers = [...apiConnections].filter(
        (c) => !workersConnections.has(c),
      );

      expect(missingInWorkers).toEqual([]);
    });
  });
});
