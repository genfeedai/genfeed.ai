import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from validate import ValidationResult, check_biome_config


class BiomeConfigTests(unittest.TestCase):
    def load_config(self, content, filename='biome.jsonc'):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / filename).write_bytes(content.encode('utf-8'))
            result = ValidationResult()
            return check_biome_config(root, result), result

    def test_preserves_quoted_urls_and_comment_markers(self):
        expected = {
            '$schema': 'https://biomejs.dev/schemas/2.3.12/schema.json',
            'line': '// literal comment',
            'block': 'before /* literal comment */ after',
        }
        for filename in ('biome.json', 'biome.jsonc'):
            with self.subTest(filename=filename):
                config, result = self.load_config(json.dumps(expected), filename)
                self.assertEqual(config, expected)
                self.assertEqual(result.issues, [])

    def test_preserves_escapes_and_backslash_parity(self):
        values = ['plain', '', '\n\r\t', '雪', '*/', '\\']
        for count in range(1, 7):
            values.extend([
                '\\' * count,
                '\\' * count + '" // literal /* block */',
                '\\' * count + '// literal',
            ])
        for value in values:
            with self.subTest(value=value):
                content = json.dumps({'value': value}) + ' /* real */ // end'
                config, result = self.load_config(content)
                self.assertEqual(config, {'value': value})
                self.assertEqual(result.issues, [])

    def test_accepts_external_comments_and_newlines(self):
        for newline in ('\n', '\r\n', '\r'):
            for filename in ('biome.json', 'biome.jsonc'):
                with self.subTest(newline=newline, filename=filename):
                    content = newline.join([
                        '// leading "quoted" /* marker',
                        '{ /* multi',
                        'line // "comment" */ "value": "https://example.test/*literal*/",',
                        '"enabled" /* between tokens */ : true // trailing',
                        '} // no final newline',
                    ])
                    config, result = self.load_config(content, filename)
                    self.assertEqual(config, {
                        'value': 'https://example.test/*literal*/', 'enabled': True,
                    })
                    self.assertEqual(result.issues, [])

    def test_rejects_malformed_input_without_broadening_grammar(self):
        malformed = [
            '', '// only a comment', '{', '{"value":}', '{"value": 1,}',
            '{"value": "unterminated // text}', '{"value": "bad\\q"}',
            '{"value": "raw\nnewline"}', '{"value": "trailing\\',
            '{} /* unterminated', '/* unterminated',
            '{"value": tr/* comment */ue}', '{"value": 1/* comment */2}',
            '{"value": 1 // comment\n 2}', '{} {}',
        ]
        for content in malformed:
            for filename in ('biome.json', 'biome.jsonc'):
                with self.subTest(content=content, filename=filename):
                    config, result = self.load_config(content, filename)
                    self.assertIsNone(config)
                    self.assertTrue(result.has_errors)
                    self.assertEqual(len(result.issues), 1)
                    issue = result.issues[0]
                    self.assertEqual(issue.file, filename)
                    self.assertTrue(issue.message.startswith('Invalid JSON: '))
                    self.assertLess(len(issue.message), 200)

    def test_plain_json_keeps_nested_values(self):
        expected = {'nested': {'values': [None, True, False, 1, -2.5]}, 'empty': {}}
        config, result = self.load_config(json.dumps(expected))
        self.assertEqual(config, expected)
        self.assertEqual(result.issues, [])

    def test_cli_retains_policy_checks_and_exit_codes(self):
        valid = {
            '$schema': 'https://biomejs.dev/schemas/2.3.12/schema.json',
            'linter': {
                'rules': {'recommended': True, 'correctness': {'useAwaitThenable': 'error'}},
                'domains': {'react': 'on'},
            },
            'assist': {'actions': {'source': {'organizeImports': 'on'}}},
            'formatter': {'indentStyle': 'space'},
        }
        cases = [
            (valid, '2.3.12', '--strict', 0, []),
            ({'$schema': 'https://biomejs.dev/schemas/1.9.0/schema.json',
              'organizeImports': {'enabled': True}}, '1.9.0', '--ci', 1, [
                  'Biome 1.x detected', 'Schema version 1.9.0 is outdated',
                  'Recommended rules not enabled', 'useAwaitThenable not enabled',
                  'No domains configured', 'organizeImports at root level is deprecated',
              ]),
            ({'formatter': {'enabled': False}}, '2.3.12', '--ci', 0, [
                'No $schema defined', 'Formatter is disabled',
            ]),
            ({'linter': {'enabled': False}}, '2.3.12', '--strict', 1, [
                'Linter is disabled', 'Import organization not configured',
            ]),
        ]
        for config, version, mode, exit_code, messages in cases:
            with self.subTest(mode=mode, config=config), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                (root / 'biome.jsonc').write_text(json.dumps(config))
                (root / 'package.json').write_text(json.dumps({
                    'devDependencies': {'@biomejs/biome': version},
                }))
                process = subprocess.run([
                    sys.executable, str(Path(__file__).with_name('validate.py')),
                    '--root', directory, '--json', mode,
                ], capture_output=True, text=True, check=False)
                self.assertEqual(process.returncode, exit_code, process.stderr)
                report = json.loads(process.stdout)
                self.assertEqual(report['biome_version'], version)
                for message in messages:
                    self.assertTrue(any(message in issue['message'] for issue in report['issues']))
                if not messages:
                    self.assertEqual(report['issues'], [])
                    self.assertEqual(report['schema_version'], '2.3.12')
                    self.assertIn('Domains enabled: react', report['passed'])
                    self.assertIn('Using recommended rules', report['passed'])


if __name__ == '__main__':
    unittest.main()
