import { PluginObj, types as t, NodePath } from '@babel/core';
import * as T from '@babel/types';

export default function plugin(): PluginObj {
  return {
    visitor: {
      CallExpression(path: NodePath<T.CallExpression>, state) {
        const callee = path.node.callee;
        if (
          T.isMemberExpression(callee) &&
          T.isIdentifier(callee.property, { name: 'operator' }) &&
          T.isMemberExpression(callee.object) &&
          T.isIdentifier(callee.object.property, { name: 'ai' }) &&
          T.isIdentifier(callee.object.object)
        ) {
          const args = path.node.arguments;
          if (
            args.length >= 1 &&
            (T.isArrowFunctionExpression(args[0]) ||
              T.isFunctionExpression(args[0]))
          ) {
            const funcNode = args[0];
            if (funcNode.start != null && funcNode.end != null) {
              const funcSource = sanitizeCode(
                state.file.code.slice(funcNode.start, funcNode.end)
              );

              // Attempt to derive a human-friendly name from the assignment context.
              // Patterns considered:
              //   const foo = calljmp.ai.operator(...)
              //   let foo = ... / var foo = ...
              //   foo = calljmp.ai.operator(...)
              //   export const foo = calljmp.ai.operator(...)
              //   { foo: calljmp.ai.operator(...) } inside object literal (use the property key)
              // Fallback: none (omit name)
              let derivedName: string | null = null;
              const parentPath = path.parentPath;
              if (parentPath) {
                if (parentPath.isVariableDeclarator()) {
                  const id = parentPath.node.id;
                  if (T.isIdentifier(id)) derivedName = id.name;
                } else if (parentPath.isAssignmentExpression()) {
                  const left = parentPath.node.left;
                  if (T.isIdentifier(left)) derivedName = left.name;
                } else if (parentPath.isObjectProperty()) {
                  const key = parentPath.node.key;
                  if (T.isIdentifier(key)) derivedName = key.name;
                  else if (T.isStringLiteral(key)) derivedName = key.value;
                } else if (parentPath.isExportNamedDeclaration()) {
                  // export const foo = calljmp.ai.operator(...)
                  const decl = parentPath.node.declaration;
                  if (decl && T.isVariableDeclaration(decl)) {
                    const declar = decl.declarations.find(
                      d => d.init === path.node
                    );
                    if (declar && T.isIdentifier(declar.id))
                      derivedName = declar.id.name;
                  }
                } else if (parentPath.isCallExpression()) {
                  // Possibly immediately passed somewhere; no assignment
                }
              }

              const nameProperty = derivedName
                ? t.objectProperty(
                    t.identifier('name'),
                    t.stringLiteral(humanize(derivedName))
                  )
                : null;

              // Build globalThis[Symbol.for('calljmp.fn.meta')]
              const globalMapRef = t.memberExpression(
                t.identifier('globalThis'),
                t.callExpression(
                  t.memberExpression(
                    t.identifier('Symbol'),
                    t.identifier('for')
                  ),
                  [t.stringLiteral('calljmp.operator.meta')]
                ),
                true
              );

              // Create an IIFE: (() => { const __f = <origFn>; globalThis[Symbol.for(sym)].set(__f, { code: "..." }); return __f; })()
              const fnId = t.identifier('__calljmp_fn');
              const metaObj = t.objectExpression([
                t.objectProperty(
                  t.identifier('code'),
                  t.stringLiteral(funcSource)
                ),
                ...(nameProperty ? [nameProperty] : []),
              ]);

              const setCall = t.callExpression(
                t.memberExpression(globalMapRef, t.identifier('set')),
                [fnId, metaObj]
              );

              const iife = t.callExpression(
                t.arrowFunctionExpression(
                  [],
                  t.blockStatement([
                    t.variableDeclaration('const', [
                      t.variableDeclarator(fnId, funcNode),
                    ]),
                    t.expressionStatement(setCall),
                    t.returnStatement(fnId),
                  ])
                ),
                []
              );

              // Replace first argument with IIFE result.
              args[0] = iife;
            }
          }
        }
      },
    },
  };
}

module.exports = plugin;

function sanitizeCode(code: string): string {
  // Replace escaped newline/tab sequences like '\n', '\r', '\t' (backslash + letter)
  // so that string literals containing escaped newlines are normalized.
  const withoutEscapes = code.replace(/\\[rntvbf0]/g, ' ');

  // Replace actual newline characters with a single space, then collapse whitespace.
  const singleLine = withoutEscapes.replace(/[\r\n]+/g, ' ').trim();

  return singleLine.replace(/\s+/g, ' ');
}

function humanize(raw: string): string {
  // Replace hyphens and underscores with spaces
  let s = raw.replace(/[-_]+/g, ' ');

  // Insert space between lower->upper boundaries (camelCase/PascalCase)
  s = s.replace(/([a-z0-9])([A-Z])/g, '$1 $2');

  // Also split sequences like "HTMLParser" into "HTML Parser" so that
  // subsequent lowercasing yields "html parser" -> "Html parser"
  s = s.replace(/([A-Z]+)([A-Z][a-z0-9])/g, '$1 $2');

  // Collapse multiple spaces
  s = s.trim().replace(/\s+/g, ' ');

  // Split into words. For sentence-like casing we:
  // - keep ALLCAPS words (acronyms) as-is
  // - lowercase other words
  // - capitalize only the first character of the whole phrase
  const words = s
    .split(' ')
    .filter(Boolean)
    .map(w => {
      // Consider a token an acronym only if it's short (1-3 chars),
      // e.g. URL, ID, API. Longer ALLCAPS tokens (like CONSTANT) will be
      // treated as normal words and lowercased so they read like a sentence.
      const isAcronym = /^[A-Z0-9]{1,3}$/.test(w);
      return isAcronym ? w : w.toLowerCase();
    });

  const phrase = words.join(' ');

  // Capitalize only the first character of the phrase
  return phrase.replace(/^\w/, c => c.toUpperCase());
}
