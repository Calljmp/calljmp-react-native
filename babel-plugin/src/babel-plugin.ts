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
              const funcSource = state.file.code.slice(
                funcNode.start,
                funcNode.end
              );
              const obj = t.objectExpression([
                t.objectProperty(
                  t.identifier('code'),
                  t.stringLiteral(funcSource)
                ),
              ]);
              args.push(obj);
            }
          }
        }
      },
    },
  };
}

module.exports = plugin;
