import copy
import unittest

from token_benchmark_contract import validate_catalog


class CatalogContractTest(unittest.TestCase):
    def setUp(self):
        self.before = {'tools': [{
            'name': 'fixture', 'description': 'Original tool explanation',
            'inputSchema': {'type': 'object', 'required': ['description'], 'properties': {
                'description': {'type': 'string', 'description': 'Original field explanation',
                                'default': 'original', 'enum': ['original'], 'minLength': 1},
                'data': {'type': 'object', 'const': {'description': 'literal'},
                         'examples': [{'description': 'example'}]},
            }},
            'outputSchema': {'type': 'object'},
            '_meta': {'genfeed.ai/creditCost': 1}, 'requiredRole': 'admin',
        }]}
        self.after = copy.deepcopy(self.before)

    def test_allows_documentation_only(self):
        self.after['tools'][0]['description'] = 'Concise explanation'
        self.after['tools'][0]['inputSchema']['properties']['description']['description'] = 'Concise field'
        validate_catalog(self.before, self.after, 'input-documentation')

    def test_allows_removing_only_schema_description_annotations(self):
        del self.after['tools'][0]['inputSchema']['properties']['description']['description']
        validate_catalog(self.before, self.after, 'input-documentation')

    def test_rejects_behavior_changes(self):
        mutations = [
            lambda tool: tool.update(name='renamed'),
            lambda tool: tool.update(requiredRole='user'),
            lambda tool: tool['_meta'].update({'genfeed.ai/creditCost': 0}),
            lambda tool: tool['outputSchema'].update(type='array'),
            lambda tool: tool['inputSchema'].update(required=[]),
            lambda tool: tool['inputSchema']['properties'].pop('description'),
            lambda tool: tool['inputSchema']['properties']['description'].update(default='changed'),
            lambda tool: tool['inputSchema']['properties']['description'].update(enum=['changed']),
            lambda tool: tool['inputSchema']['properties']['description'].update(minLength=True),
            lambda tool: tool['inputSchema']['properties']['data']['const'].update(description='changed literal'),
            lambda tool: tool['inputSchema']['properties']['data']['examples'][0].update(description='changed example'),
        ]
        for mutate in mutations:
            with self.subTest(mutation=mutate):
                candidate = copy.deepcopy(self.before)
                mutate(candidate['tools'][0])
                with self.assertRaises(ValueError):
                    validate_catalog(self.before, candidate, 'input-documentation')
        with self.assertRaises(ValueError):
            validate_catalog(self.before, {'tools': []}, 'input-documentation')

    def test_output_mode_keeps_original_input_guard(self):
        self.after['tools'][0]['outputSchema'] = {'type': 'object', 'properties': {}}
        validate_catalog(self.before, self.after, 'output')
        self.after['tools'][0]['description'] = 'Changed input guidance'
        with self.assertRaises(ValueError):
            validate_catalog(self.before, self.after, 'output')


if __name__ == '__main__':
    unittest.main()
