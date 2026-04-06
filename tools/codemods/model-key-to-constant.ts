import type { API, FileInfo } from 'jscodeshift';

export default function transformer(file: FileInfo, api: API) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let hasChanges = false;

  // Replace ModelKey.X member expressions with MODEL_KEYS.X
  root
    .find(j.MemberExpression, {
      object: { type: 'Identifier', name: 'ModelKey' },
    })
    .forEach((path) => {
      const property = path.node.property;
      if (property.type === 'Identifier') {
        path.node.object = j.identifier('MODEL_KEYS');
        hasChanges = true;
      }
    });

  // Replace Object.values(ModelKey) with Object.values(MODEL_KEYS)
  root
    .find(j.CallExpression, {
      callee: {
        type: 'MemberExpression',
        object: { name: 'Object' },
        property: { name: 'values' },
      },
    })
    .forEach((path) => {
      const arg = path.node.arguments[0];
      if (arg && arg.type === 'Identifier' && arg.name === 'ModelKey') {
        (arg as { name: string }).name = 'MODEL_KEYS';
        hasChanges = true;
      }
    });

  // Replace ModelKey in type annotations with string
  root
    .find(j.TSTypeReference, {
      typeName: { type: 'Identifier', name: 'ModelKey' },
    })
    .forEach((path) => {
      j(path).replaceWith(j.tsStringKeyword());
      hasChanges = true;
    });

  // Replace `as ModelKey` type assertions with `as string`
  root
    .find(j.TSAsExpression, {
      typeAnnotation: {
        type: 'TSTypeReference',
        typeName: { type: 'Identifier', name: 'ModelKey' },
      },
    })
    .forEach((path) => {
      path.node.typeAnnotation = j.tsStringKeyword();
      hasChanges = true;
    });

  if (!hasChanges) return undefined;

  // Update imports: remove ModelKey from @genfeedai/enums, add MODEL_KEYS from @genfeedai/constants
  root
    .find(j.ImportDeclaration, {
      source: { value: '@genfeedai/enums' },
    })
    .forEach((path) => {
      const specifiers = path.node.specifiers ?? [];
      const modelKeyIdx = specifiers.findIndex(
        (s) =>
          s.type === 'ImportSpecifier' &&
          s.imported.type === 'Identifier' &&
          s.imported.name === 'ModelKey',
      );
      if (modelKeyIdx !== -1) {
        specifiers.splice(modelKeyIdx, 1);
        if (specifiers.length === 0) {
          j(path).remove();
        }
      }
    });

  // Add MODEL_KEYS import if not already present
  const hasModelKeysImport =
    root
      .find(j.ImportDeclaration, { source: { value: '@genfeedai/constants' } })
      .filter((path) =>
        (path.node.specifiers ?? []).some(
          (s) =>
            s.type === 'ImportSpecifier' &&
            s.imported.type === 'Identifier' &&
            s.imported.name === 'MODEL_KEYS',
        ),
      ).length > 0;

  if (!hasModelKeysImport) {
    const constImport = root.find(j.ImportDeclaration, {
      source: { value: '@genfeedai/constants' },
    });

    if (constImport.length > 0) {
      constImport
        .at(0)
        .get()
        .node.specifiers?.push(j.importSpecifier(j.identifier('MODEL_KEYS')));
    } else {
      const newImport = j.importDeclaration(
        [j.importSpecifier(j.identifier('MODEL_KEYS'))],
        j.literal('@genfeedai/constants'),
      );
      const body = root.find(j.Program).get('body');
      body.value.unshift(newImport);
    }
  }

  return root.toSource({ quote: 'single' });
}
