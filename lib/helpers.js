'use strict';

require('core-js/modules/es.object.from-entries');

Object.defineProperty(exports, '__esModule', {
  value: true,
});
exports.lintCallExpression = lintCallExpression;
exports.lintNewExpression = lintNewExpression;
exports.lintExpressionStatement = lintExpressionStatement;
exports.lintMemberExpression = lintMemberExpression;
exports.reverseTargetMappings = reverseTargetMappings;
exports.determineTargetsFromConfig = determineTargetsFromConfig;
exports.parseBrowsersListVersion = parseBrowsersListVersion;

var _browserslist = _interopRequireDefault(require('browserslist'));

var _lodash = _interopRequireDefault(require('lodash.memoize'));

function _interopRequireDefault(obj) {
  return obj && obj.__esModule ? obj : { default: obj };
}

/* eslint no-nested-ternary: off */

/*
3) Figures out which browsers user is targeting

- Uses browserslist config and/or targets defined eslint config to discover this
- For every API ecnountered during traversal, gets compat record for that
- Protochain (e.g. 'document.querySelector')
  - All of the rules have compatibility info attached to them
- Each API is given to versioning.ts with compatibility info
*/
function isInsideIfStatement(context) {
  return context.getAncestors().some((ancestor) => {
    return ancestor.type === 'IfStatement';
  });
}

function checkNotInsideIfStatementAndReport(
  context,
  handleFailingRule,
  failingRule,
  node
) {
  if (!isInsideIfStatement(context)) {
    handleFailingRule(failingRule, node);
  }
}

function lintCallExpression(context, handleFailingRule, rules, node) {
  if (!node.callee) return;
  const calleeName = node.callee.name;
  const failingRule = rules.find((rule) => rule.object === calleeName);
  if (failingRule)
    checkNotInsideIfStatementAndReport(
      context,
      handleFailingRule,
      failingRule,
      node
    );
}

function lintNewExpression(context, handleFailingRule, rules, node) {
  if (!node.callee) return;
  const calleeName = node.callee.name;
  const failingRule = rules.find((rule) => rule.object === calleeName);
  if (failingRule)
    checkNotInsideIfStatementAndReport(
      context,
      handleFailingRule,
      failingRule,
      node
    );
}

function lintExpressionStatement(context, handleFailingRule, rules, node) {
  var _node$expression;

  if (
    !(node === null || node === void 0
      ? void 0
      : (_node$expression = node.expression) === null ||
        _node$expression === void 0
      ? void 0
      : _node$expression.name)
  )
    return;
  const failingRule = rules.find((rule) => {
    var _node$expression2;

    return (
      rule.object ===
      (node === null || node === void 0
        ? void 0
        : (_node$expression2 = node.expression) === null ||
          _node$expression2 === void 0
        ? void 0
        : _node$expression2.name)
    );
  });
  if (failingRule)
    checkNotInsideIfStatementAndReport(
      context,
      handleFailingRule,
      failingRule,
      node
    );
}

function protoChainFromMemberExpression(node) {
  if (!node.object) return [node.name];

  const protoChain = (() => {
    switch (node.object.type) {
      case 'NewExpression':
      case 'CallExpression':
        return protoChainFromMemberExpression(node.object.callee);

      default:
        return protoChainFromMemberExpression(node.object);
    }
  })();

  return [...protoChain, node.property.name];
}

function getTypePrefix(type) {
  if (type.includes('ArrayExpression')) {
    return 'Array.';
  } else if (type.includes('Literal')) {
    return 'String.';
  }
}

const getInstanceMethodSet = (0, _lodash.default)(
  (instanceArrayJSON) => new Set(JSON.parse(instanceArrayJSON))
);

function lintMemberExpression(context, handleFailingRule, rules, node) {
  if (!node.object || !node.property) return;

  const instanceSet = getInstanceMethodSet(
    JSON.stringify(context.settings.instances)
  );
  const instanceArr = [...instanceSet];
  const propertyName = node.property.name;
  const isInInstanceArr = instanceArr.some((object) =>
    object.includes(propertyName)
  );

  if (isInInstanceArr) {
    let relevantMethods = [];
    const objectType = node.object.type;

    instanceArr.forEach((methodName) => {
      if (methodName.includes(propertyName)) {
        relevantMethods.push(methodName);
      }
    });

    if (
      objectType !== 'Identifier' &&
      (objectType === 'Literal' || objectType === 'ArrayExpression')
    ) {
      relevantMethods = relevantMethods.filter((method) =>
        method.includes(getTypePrefix(objectType))
      );
    }

    relevantMethods.forEach((methodName) => {
      const failingRule = rules.find((rule) => rule.protoChainId == methodName);
      if (failingRule)
        checkNotInsideIfStatementAndReport(
          context,
          handleFailingRule,
          failingRule,
          node
        );
    });
  } else if (
    !node.object.name ||
    node.object.name === 'window' ||
    node.object.name === 'globalThis'
  ) {
    const rawProtoChain = protoChainFromMemberExpression(node);
    const [firstObj] = rawProtoChain;
    const protoChain =
      firstObj === 'window' || firstObj === 'globalThis'
        ? rawProtoChain.slice(1)
        : rawProtoChain;
    const protoChainId = protoChain.join('.');
    const failingRule = rules.find(
      (rule) => rule.protoChainId === protoChainId
    );

    if (failingRule) {
      checkNotInsideIfStatementAndReport(
        context,
        handleFailingRule,
        failingRule,
        node
      );
    }
  } else {
    const objectName = node.object.name;
    const propertyName = node.property.name;
    const failingRule = rules.find(
      (rule) =>
        rule.object === objectName &&
        (rule.property == null || rule.property === propertyName)
    );
    if (failingRule)
      checkNotInsideIfStatementAndReport(
        context,
        handleFailingRule,
        failingRule,
        node
      );
  }
}

function reverseTargetMappings(targetMappings) {
  const reversedEntries = Object.entries(targetMappings).map((entry) =>
    entry.reverse()
  );
  return Object.fromEntries(reversedEntries);
}
/**
 * Determine the targets based on the browserslist config object
 * Get the targets from the eslint config and merge them with targets in browserslist config
 * Eslint target config will be deprecated in 4.0.0
 *
 * @param configPath - The file or a directory path to look for the browserslist config file
 */

function determineTargetsFromConfig(configPath, config) {
  const browserslistOpts = {
    path: configPath,
  };

  const eslintTargets = (() => {
    // Get targets from eslint settings
    if (Array.isArray(config) || typeof config === 'string') {
      return (0, _browserslist.default)(config, browserslistOpts);
    }

    if (config && typeof config === 'object') {
      return (0, _browserslist.default)(
        [...(config.production || []), ...(config.development || [])],
        browserslistOpts
      );
    }

    return [];
  })();

  if (_browserslist.default.findConfig(configPath)) {
    // If targets are defined in ESLint and browerslist configs, merge the targets together
    if (eslintTargets.length) {
      const browserslistTargets = (0, _browserslist.default)(
        undefined,
        browserslistOpts
      );
      return Array.from(new Set(eslintTargets.concat(browserslistTargets)));
    }
  } else if (eslintTargets.length) {
    return eslintTargets;
  } // Get targets fron browserslist configs

  return (0, _browserslist.default)(undefined, browserslistOpts);
}
/**
 * Parses the versions that are given by browserslist. They're
 *
 * ```ts
 * parseBrowsersListVersion(['chrome 50'])
 *
 * {
 *   target: 'chrome',
 *   parsedVersion: 50,
 *   version: '50'
 * }
 * ```
 * @param targetslist - List of targest from browserslist api
 * @returns - The lowest version version of each target
 */

function parseBrowsersListVersion(targetslist) {
  return (
    // Sort the targets by target name and then version number in ascending order
    targetslist
      .map((e) => {
        const [target, version] = e.split(' ');

        const parsedVersion = (() => {
          if (typeof version === 'number') return version;
          if (version === 'all') return 0;
          return version.includes('-')
            ? parseFloat(version.split('-')[0])
            : parseFloat(version);
        })();

        return {
          target,
          version,
          parsedVersion,
        };
      }) // Sort the targets by target name and then version number in descending order
      // ex. [a@3, b@3, a@1] => [a@3, a@1, b@3]
      .sort((a, b) => {
        if (b.target === a.target) {
          // If any version === 'all', return 0. The only version of op_mini is 'all'
          // Otherwise, compare the versions
          return typeof b.parsedVersion === 'string' ||
            typeof a.parsedVersion === 'string'
            ? 0
            : b.parsedVersion - a.parsedVersion;
        }

        return b.target > a.target ? 1 : -1;
      }) // First last target always has the latest version
      .filter(
        (
          e,
          i,
          items // Check if the current target is the last of its kind.
        ) =>
          // If it is, then it's the most recent version.
          i + 1 === items.length || e.target !== items[i + 1].target
      )
  );
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9oZWxwZXJzLnRzIl0sIm5hbWVzIjpbImlzSW5zaWRlSWZTdGF0ZW1lbnQiLCJjb250ZXh0IiwiZ2V0QW5jZXN0b3JzIiwic29tZSIsImFuY2VzdG9yIiwidHlwZSIsImNoZWNrTm90SW5zaWRlSWZTdGF0ZW1lbnRBbmRSZXBvcnQiLCJoYW5kbGVGYWlsaW5nUnVsZSIsImZhaWxpbmdSdWxlIiwibm9kZSIsImxpbnRDYWxsRXhwcmVzc2lvbiIsInJ1bGVzIiwiY2FsbGVlIiwiY2FsbGVlTmFtZSIsIm5hbWUiLCJmaW5kIiwicnVsZSIsIm9iamVjdCIsImxpbnROZXdFeHByZXNzaW9uIiwibGludEV4cHJlc3Npb25TdGF0ZW1lbnQiLCJleHByZXNzaW9uIiwicHJvdG9DaGFpbkZyb21NZW1iZXJFeHByZXNzaW9uIiwicHJvdG9DaGFpbiIsInByb3BlcnR5IiwibGludE1lbWJlckV4cHJlc3Npb24iLCJyYXdQcm90b0NoYWluIiwiZmlyc3RPYmoiLCJzbGljZSIsInByb3RvQ2hhaW5JZCIsImpvaW4iLCJvYmplY3ROYW1lIiwicHJvcGVydHlOYW1lIiwicmV2ZXJzZVRhcmdldE1hcHBpbmdzIiwidGFyZ2V0TWFwcGluZ3MiLCJyZXZlcnNlZEVudHJpZXMiLCJPYmplY3QiLCJlbnRyaWVzIiwibWFwIiwiZW50cnkiLCJyZXZlcnNlIiwiZnJvbUVudHJpZXMiLCJkZXRlcm1pbmVUYXJnZXRzRnJvbUNvbmZpZyIsImNvbmZpZ1BhdGgiLCJjb25maWciLCJicm93c2Vyc2xpc3RPcHRzIiwicGF0aCIsImVzbGludFRhcmdldHMiLCJBcnJheSIsImlzQXJyYXkiLCJwcm9kdWN0aW9uIiwiZGV2ZWxvcG1lbnQiLCJicm93c2Vyc2xpc3QiLCJmaW5kQ29uZmlnIiwibGVuZ3RoIiwiYnJvd3NlcnNsaXN0VGFyZ2V0cyIsInVuZGVmaW5lZCIsImZyb20iLCJTZXQiLCJjb25jYXQiLCJwYXJzZUJyb3dzZXJzTGlzdFZlcnNpb24iLCJ0YXJnZXRzbGlzdCIsImUiLCJ0YXJnZXQiLCJ2ZXJzaW9uIiwic3BsaXQiLCJwYXJzZWRWZXJzaW9uIiwiaW5jbHVkZXMiLCJwYXJzZUZsb2F0Iiwic29ydCIsImEiLCJiIiwiZmlsdGVyIiwiaSIsIml0ZW1zIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7QUFDQTs7OztBQURBOztBQVlBOzs7Ozs7Ozs7QUFTQSxTQUFTQSxtQkFBVCxDQUE2QkMsT0FBN0IsRUFBK0M7QUFDN0MsU0FBT0EsT0FBTyxDQUFDQyxZQUFSLEdBQXVCQyxJQUF2QixDQUE2QkMsUUFBRCxJQUFjO0FBQy9DLFdBQU9BLFFBQVEsQ0FBQ0MsSUFBVCxLQUFrQixhQUF6QjtBQUNELEdBRk0sQ0FBUDtBQUdEOztBQUVELFNBQVNDLGtDQUFULENBQ0VMLE9BREYsRUFFRU0saUJBRkYsRUFHRUMsV0FIRixFQUlFQyxJQUpGLEVBS0U7QUFDQSxNQUFJLENBQUNULG1CQUFtQixDQUFDQyxPQUFELENBQXhCLEVBQW1DO0FBQ2pDTSxJQUFBQSxpQkFBaUIsQ0FBQ0MsV0FBRCxFQUFjQyxJQUFkLENBQWpCO0FBQ0Q7QUFDRjs7QUFFTSxTQUFTQyxrQkFBVCxDQUNMVCxPQURLLEVBRUxNLGlCQUZLLEVBR0xJLEtBSEssRUFJTEYsSUFKSyxFQUtMO0FBQ0EsTUFBSSxDQUFDQSxJQUFJLENBQUNHLE1BQVYsRUFBa0I7QUFDbEIsUUFBTUMsVUFBVSxHQUFHSixJQUFJLENBQUNHLE1BQUwsQ0FBWUUsSUFBL0I7QUFDQSxRQUFNTixXQUFXLEdBQUdHLEtBQUssQ0FBQ0ksSUFBTixDQUFZQyxJQUFELElBQVVBLElBQUksQ0FBQ0MsTUFBTCxLQUFnQkosVUFBckMsQ0FBcEI7QUFDQSxNQUFJTCxXQUFKLEVBQ0VGLGtDQUFrQyxDQUNoQ0wsT0FEZ0MsRUFFaENNLGlCQUZnQyxFQUdoQ0MsV0FIZ0MsRUFJaENDLElBSmdDLENBQWxDO0FBTUg7O0FBRU0sU0FBU1MsaUJBQVQsQ0FDTGpCLE9BREssRUFFTE0saUJBRkssRUFHTEksS0FISyxFQUlMRixJQUpLLEVBS0w7QUFDQSxN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LE9BQU8sQ0FBQ0csUUFBUixDQUFpQixHQUFqQixJQUNIQyxVQUFVLENBQUNKLE9BQU8sQ0FBQ0MsS0FBUixDQUFjLEdBQWQsRUFBbUIsQ0FBbkIsQ0FBRCxDQURQLEdBRUhHLFVBQVUsQ0FBQ0osT0FBRCxDQUZkO0FBR0QsT0FONkIsR0FBOUI7O0FBUUEsYUFBTztBQUNMRCxRQUFBQSxNQURLO0FBRUxDLFFBQUFBLE9BRks7QUFHTEUsUUFBQUE7QUFISyxPQUFQO0FBS0QsS0FyQkwsRUFzQkk7QUFDRjtBQXZCRixLQXdCR0csSUF4QkgsQ0F3QlEsQ0FBQ0MsQ0FBRCxFQUFZQyxDQUFaLEtBQWtDO0FBQ3RDLFVBQUlBLENBQUMsQ0FBQ1IsTUFBRixLQUFhTyxDQUFDLENBQUNQLE1BQW5CLEVBQTJCO0FBQ3pCO0FBQ0E7QUFDQSxlQUFPLE9BQU9RLENBQUMsQ0FBQ0wsYUFBVCxLQUEyQixRQUEzQixJQUNMLE9BQU9JLENBQUMsQ0FBQ0osYUFBVCxLQUEyQixRQUR0QixHQUVILENBRkcsR0FHSEssQ0FBQyxDQUFDTCxhQUFGLEdBQWtCSSxDQUFDLENBQUNKLGFBSHhCO0FBSUQ7O0FBQ0QsYUFBT0ssQ0FBQyxDQUFDUixNQUFGLEdBQVdPLENBQUMsQ0FBQ1AsTUFBYixHQUFzQixDQUF0QixHQUEwQixDQUFDLENBQWxDO0FBQ0QsS0FsQ0gsRUFrQ0s7QUFsQ0wsS0FtQ0dTLE1BbkNILENBb0NJLENBQUNWLENBQUQsRUFBWVcsQ0FBWixFQUF1QkMsS0FBdkIsS0FDRTtBQUNBO0FBQ0FELElBQUFBLENBQUMsR0FBRyxDQUFKLEtBQVVDLEtBQUssQ0FBQ3BCLE1BQWhCLElBQTBCUSxDQUFDLENBQUNDLE1BQUYsS0FBYVcsS0FBSyxDQUFDRCxDQUFDLEdBQUcsQ0FBTCxDQUFMLENBQWFWLE1BdkMxRDtBQUZGO0FBNENEIiwic291cmNlc0NvbnRlbnQiOlsiLyogZXNsaW50IG5vLW5lc3RlZC10ZXJuYXJ5OiBvZmYgKi9cbmltcG9ydCBicm93c2Vyc2xpc3QgZnJvbSBcImJyb3dzZXJzbGlzdFwiO1xuaW1wb3J0IHtcbiAgQXN0TWV0YWRhdGFBcGlXaXRoVGFyZ2V0c1Jlc29sdmVyLFxuICBFU0xpbnROb2RlLFxuICBCcm93c2VyTGlzdENvbmZpZyxcbiAgVGFyZ2V0LFxuICBIYW5kbGVGYWlsaW5nUnVsZSxcbiAgQ29udGV4dCxcbn0gZnJvbSBcIi4vdHlwZXNcIjtcbmltcG9ydCB7IFRhcmdldE5hbWVNYXBwaW5ncyB9IGZyb20gXCIuL2NvbnN0YW50c1wiO1xuXG4vKlxuMykgRmlndXJlcyBvdXQgd2hpY2ggYnJvd3NlcnMgdXNlciBpcyB0YXJnZXRpbmdcblxuLSBVc2VzIGJyb3dzZXJzbGlzdCBjb25maWcgYW5kL29yIHRhcmdldHMgZGVmaW5lZCBlc2xpbnQgY29uZmlnIHRvIGRpc2NvdmVyIHRoaXNcbi0gRm9yIGV2ZXJ5IEFQSSBlY25vdW50ZXJlZCBkdXJpbmcgdHJhdmVyc2FsLCBnZXRzIGNvbXBhdCByZWNvcmQgZm9yIHRoYXRcbi0gUHJvdG9jaGFpbiAoZS5nLiAnZG9jdW1lbnQucXVlcnlTZWxlY3RvcicpXG4gIC0gQWxsIG9mIHRoZSBydWxlcyBoYXZlIGNvbXBhdGliaWxpdHkgaW5mbyBhdHRhY2hlZCB0byB0aGVtXG4tIEVhY2ggQVBJIGlzIGdpdmVuIHRvIHZlcnNpb25pbmcudHMgd2l0aCBjb21wYXRpYmlsaXR5IGluZm9cbiovXG5mdW5jdGlvbiBpc0luc2lkZUlmU3RhdGVtZW50KGNvbnRleHQ6IENvbnRleHQpIHtcbiAgcmV0dXJuIGNvbnRleHQuZ2V0QW5jZXN0b3JzKCkuc29tZSgoYW5jZXN0b3IpID0+IHtcbiAgICByZXR1cm4gYW5jZXN0b3IudHlwZSA9PT0gXCJJZlN0YXRlbWVudFwiO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gY2hlY2tOb3RJbnNpZGVJZlN0YXRlbWVudEFuZFJlcG9ydChcbiAgY29udGV4dDogQ29udGV4dCxcbiAgaGFuZGxlRmFpbGluZ1J1bGU6IEhhbmRsZUZhaWxpbmdSdWxlLFxuICBmYWlsaW5nUnVsZTogQXN0TWV0YWRhdGFBcGlXaXRoVGFyZ2V0c1Jlc29sdmVyLFxuICBub2RlOiBFU0xpbnROb2RlXG4pIHtcbiAgaWYgKCFpc0luc2lkZUlmU3RhdGVtZW50KGNvbnRleHQpKSB7XG4gICAgaGFuZGxlRmFpbGluZ1J1bGUoZmFpbGluZ1J1bGUsIG5vZGUpO1xuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBsaW50Q2FsbEV4cHJlc3Npb24oXG4gIGNvbnRleHQ6IENvbnRleHQsXG4gIGhhbmRsZUZhaWxpbmdSdWxlOiBIYW5kbGVGYWlsaW5nUnVsZSxcbiAgcnVsZXM6IEFzdE1ldGFkYXRhQXBpV2l0aFRhcmdldHNSZXNvbHZlcltdLFxuICBub2RlOiBFU0xpbnROb2RlXG4pIHtcbiAgaWYgKCFub2RlLmNhbGxlZSkgcmV0dXJuO1xuICBjb25zdCBjYWxsZWVOYW1lID0gbm9kZS5jYWxsZWUubmFtZTtcbiAgY29uc3QgZmFpbGluZ1J1bGUgPSBydWxlcy5maW5kKChydWxlKSA9PiBydWxlLm9iamVjdCA9PT0gY2FsbGVlTmFtZSk7XG4gIGlmIChmYWlsaW5nUnVsZSlcbiAgICBjaGVja05vdEluc2lkZUlmU3RhdGVtZW50QW5kUmVwb3J0KFxuICAgICAgY29udGV4dCxcbiAgICAgIGhhbmRsZUZhaWxpbmdSdWxlLFxuICAgICAgZmFpbGluZ1J1bGUsXG4gICAgICBub2RlXG4gICAgKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGxpbnROZXdFeHByZXNzaW9uKFxuICBjb250ZXh0OiBDb250ZXh0LFxuICBoYW5kbGVGYWlsaW5nUnVsZTogSGFuZGxlRmFpbGluZ1J1bGUsXG4gIHJ1bGVzOiBBcnJheTxBc3RNZXRhZGF0YUFwaVdpdGhUYXJnZXRzUmVzb2x2ZXI+LFxuICBub2RlOiBFU0xpbnROb2RlXG4pIHtcbiAgaWYgKCFub2RlLmNhbGxlZSkgcmV0dXJuO1xuICBjb25zdCBjYWxsZWVOYW1lID0gbm9kZS5jYWxsZWUubmFtZTtcbiAgY29uc3QgZmFpbGluZ1J1bGUgPSBydWxlcy5maW5kKChydWxlKSA9PiBydWxlLm9iamVjdCA9PT0gY2FsbGVlTmFtZSk7XG4gIGlmIChmYWlsaW5nUnVsZSlcbiAgICBjaGVja05vdEluc2lkZUlmU3RhdGVtZW50QW5kUmVwb3J0KFxuICAgICAgY29udGV4dCxcbiAgICAgIGhhbmRsZUZhaWxpbmdSdWxlLFxuICAgICAgZmFpbGluZ1J1bGUsXG4gICAgICBub2RlXG4gICAgKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGxpbnRFeHByZXNzaW9uU3RhdGVtZW50KFxuICBjb250ZXh0OiBDb250ZXh0LFxuICBoYW5kbGVGYWlsaW5nUnVsZTogSGFuZGxlRmFpbGluZ1J1bGUsXG4gIHJ1bGVzOiBBc3RNZXRhZGF0YUFwaVdpdGhUYXJnZXRzUmVzb2x2ZXJbXSxcbiAgbm9kZTogRVNMaW50Tm9kZVxuKSB7XG4gIGlmICghbm9kZT8uZXhwcmVzc2lvbj8ubmFtZSkgcmV0dXJuO1xuICBjb25zdCBmYWlsaW5nUnVsZSA9IHJ1bGVzLmZpbmQoXG4gICAgKHJ1bGUpID0+IHJ1bGUub2JqZWN0ID09PSBub2RlPy5leHByZXNzaW9uPy5uYW1lXG4gICk7XG4gIGlmIChmYWlsaW5nUnVsZSlcbiAgICBjaGVja05vdEluc2lkZUlmU3RhdGVtZW50QW5kUmVwb3J0KFxuICAgICAgY29udGV4dCxcbiAgICAgIGhhbmRsZUZhaWxpbmdSdWxlLFxuICAgICAgZmFpbGluZ1J1bGUsXG4gICAgICBub2RlXG4gICAgKTtcbn1cblxuZnVuY3Rpb24gcHJvdG9DaGFpbkZyb21NZW1iZXJFeHByZXNzaW9uKG5vZGU6IEVTTGludE5vZGUpOiBzdHJpbmdbXSB7XG4gIGlmICghbm9kZS5vYmplY3QpIHJldHVybiBbbm9kZS5uYW1lXTtcbiAgY29uc3QgcHJvdG9DaGFpbiA9ICgoKSA9PiB7XG4gICAgc3dpdGNoIChub2RlLm9iamVjdC50eXBlKSB7XG4gICAgICBjYXNlIFwiTmV3RXhwcmVzc2lvblwiOlxuICAgICAgY2FzZSBcIkNhbGxFeHByZXNzaW9uXCI6XG4gICAgICAgIHJldHVybiBwcm90b0NoYWluRnJvbU1lbWJlckV4cHJlc3Npb24obm9kZS5vYmplY3QuY2FsbGVlKTtcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHJldHVybiBwcm90b0NoYWluRnJvbU1lbWJlckV4cHJlc3Npb24obm9kZS5vYmplY3QpO1xuICAgIH1cbiAgfSkoKTtcbiAgcmV0dXJuIFsuLi5wcm90b0NoYWluLCBub2RlLnByb3BlcnR5Lm5hbWVdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbGludE1lbWJlckV4cHJlc3Npb24oXG4gIGNvbnRleHQ6IENvbnRleHQsXG4gIGhhbmRsZUZhaWxpbmdSdWxlOiBIYW5kbGVGYWlsaW5nUnVsZSxcbiAgcnVsZXM6IEFycmF5PEFzdE1ldGFkYXRhQXBpV2l0aFRhcmdldHNSZXNvbHZlcj4sXG4gIG5vZGU6IEVTTGludE5vZGVcbikge1xuICBpZiAoIW5vZGUub2JqZWN0IHx8ICFub2RlLnByb3BlcnR5KSByZXR1cm47XG4gIGlmIChcbiAgICAhbm9kZS5vYmplY3QubmFtZSB8fFxuICAgIG5vZGUub2JqZWN0Lm5hbWUgPT09IFwid2luZG93XCIgfHxcbiAgICBub2RlLm9iamVjdC5uYW1lID09PSBcImdsb2JhbFRoaXNcIlxuICApIHtcbiAgICBjb25zdCByYXdQcm90b0NoYWluID0gcHJvdG9DaGFpbkZyb21NZW1iZXJFeHByZXNzaW9uKG5vZGUpO1xuICAgIGNvbnN0IFtmaXJzdE9ial0gPSByYXdQcm90b0NoYWluO1xuICAgIGNvbnN0IHByb3RvQ2hhaW4gPVxuICAgICAgZmlyc3RPYmogPT09IFwid2luZG93XCIgfHwgZmlyc3RPYmogPT09IFwiZ2xvYmFsVGhpc1wiXG4gICAgICAgID8gcmF3UHJvdG9DaGFpbi5zbGljZSgxKVxuICAgICAgICA6IHJhd1Byb3RvQ2hhaW47XG4gICAgY29uc3QgcHJvdG9DaGFpbklkID0gcHJvdG9DaGFpbi5qb2luKFwiLlwiKTtcbiAgICBjb25zdCBmYWlsaW5nUnVsZSA9IHJ1bGVzLmZpbmQoXG4gICAgICAocnVsZSkgPT4gcnVsZS5wcm90b0NoYWluSWQgPT09IHByb3RvQ2hhaW5JZFxuICAgICk7XG4gICAgaWYgKGZhaWxpbmdSdWxlKSB7XG4gICAgICBjaGVja05vdEluc2lkZUlmU3RhdGVtZW50QW5kUmVwb3J0KFxuICAgICAgICBjb250ZXh0LFxuICAgICAgICBoYW5kbGVGYWlsaW5nUnVsZSxcbiAgICAgICAgZmFpbGluZ1J1bGUsXG4gICAgICAgIG5vZGVcbiAgICAgICk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGNvbnN0IG9iamVjdE5hbWUgPSBub2RlLm9iamVjdC5uYW1lO1xuICAgIGNvbnN0IHByb3BlcnR5TmFtZSA9IG5vZGUucHJvcGVydHkubmFtZTtcbiAgICBjb25zdCBmYWlsaW5nUnVsZSA9IHJ1bGVzLmZpbmQoXG4gICAgICAocnVsZSkgPT5cbiAgICAgICAgcnVsZS5vYmplY3QgPT09IG9iamVjdE5hbWUgJiZcbiAgICAgICAgKHJ1bGUucHJvcGVydHkgPT0gbnVsbCB8fCBydWxlLnByb3BlcnR5ID09PSBwcm9wZXJ0eU5hbWUpXG4gICAgKTtcbiAgICBpZiAoZmFpbGluZ1J1bGUpXG4gICAgICBjaGVja05vdEluc2lkZUlmU3RhdGVtZW50QW5kUmVwb3J0KFxuICAgICAgICBjb250ZXh0LFxuICAgICAgICBoYW5kbGVGYWlsaW5nUnVsZSxcbiAgICAgICAgZmFpbGluZ1J1bGUsXG4gICAgICAgIG5vZGVcbiAgICAgICk7XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJldmVyc2VUYXJnZXRNYXBwaW5ncyh0YXJnZXRNYXBwaW5nczogUmVjb3JkPHN0cmluZywgc3RyaW5nPikge1xuICBjb25zdCByZXZlcnNlZEVudHJpZXMgPSBPYmplY3QuZW50cmllcyh0YXJnZXRNYXBwaW5ncykubWFwKChlbnRyeSkgPT5cbiAgICBlbnRyeS5yZXZlcnNlKClcbiAgKTtcbiAgcmV0dXJuIE9iamVjdC5mcm9tRW50cmllcyhyZXZlcnNlZEVudHJpZXMpO1xufVxuXG4vKipcbiAqIERldGVybWluZSB0aGUgdGFyZ2V0cyBiYXNlZCBvbiB0aGUgYnJvd3NlcnNsaXN0IGNvbmZpZyBvYmplY3RcbiAqIEdldCB0aGUgdGFyZ2V0cyBmcm9tIHRoZSBlc2xpbnQgY29uZmlnIGFuZCBtZXJnZSB0aGVtIHdpdGggdGFyZ2V0cyBpbiBicm93c2Vyc2xpc3QgY29uZmlnXG4gKiBFc2xpbnQgdGFyZ2V0IGNvbmZpZyB3aWxsIGJlIGRlcHJlY2F0ZWQgaW4gNC4wLjBcbiAqXG4gKiBAcGFyYW0gY29uZmlnUGF0aCAtIFRoZSBmaWxlIG9yIGEgZGlyZWN0b3J5IHBhdGggdG8gbG9vayBmb3IgdGhlIGJyb3dzZXJzbGlzdCBjb25maWcgZmlsZVxuICovXG5leHBvcnQgZnVuY3Rpb24gZGV0ZXJtaW5lVGFyZ2V0c0Zyb21Db25maWcoXG4gIGNvbmZpZ1BhdGg6IHN0cmluZyxcbiAgY29uZmlnPzogQnJvd3Nlckxpc3RDb25maWdcbik6IEFycmF5PHN0cmluZz4ge1xuICBjb25zdCBicm93c2Vyc2xpc3RPcHRzID0geyBwYXRoOiBjb25maWdQYXRoIH07XG5cbiAgY29uc3QgZXNsaW50VGFyZ2V0cyA9ICgoKSA9PiB7XG4gICAgLy8gR2V0IHRhcmdldHMgZnJvbSBlc2xpbnQgc2V0dGluZ3NcbiAgICBpZiAoQXJyYXkuaXNBcnJheShjb25maWcpIHx8IHR5cGVvZiBjb25maWcgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgIHJldHVybiBicm93c2Vyc2xpc3QoY29uZmlnLCBicm93c2Vyc2xpc3RPcHRzKTtcbiAgICB9XG4gICAgaWYgKGNvbmZpZyAmJiB0eXBlb2YgY29uZmlnID09PSBcIm9iamVjdFwiKSB7XG4gICAgICByZXR1cm4gYnJvd3NlcnNsaXN0KFxuICAgICAgICBbLi4uKGNvbmZpZy5wcm9kdWN0aW9uIHx8IFtdKSwgLi4uKGNvbmZpZy5kZXZlbG9wbWVudCB8fCBbXSldLFxuICAgICAgICBicm93c2Vyc2xpc3RPcHRzXG4gICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gW107XG4gIH0pKCk7XG5cbiAgaWYgKGJyb3dzZXJzbGlzdC5maW5kQ29uZmlnKGNvbmZpZ1BhdGgpKSB7XG4gICAgLy8gSWYgdGFyZ2V0cyBhcmUgZGVmaW5lZCBpbiBFU0xpbnQgYW5kIGJyb3dlcnNsaXN0IGNvbmZpZ3MsIG1lcmdlIHRoZSB0YXJnZXRzIHRvZ2V0aGVyXG4gICAgaWYgKGVzbGludFRhcmdldHMubGVuZ3RoKSB7XG4gICAgICBjb25zdCBicm93c2Vyc2xpc3RUYXJnZXRzID0gYnJvd3NlcnNsaXN0KHVuZGVmaW5lZCwgYnJvd3NlcnNsaXN0T3B0cyk7XG4gICAgICByZXR1cm4gQXJyYXkuZnJvbShuZXcgU2V0KGVzbGludFRhcmdldHMuY29uY2F0KGJyb3dzZXJzbGlzdFRhcmdldHMpKSk7XG4gICAgfVxuICB9IGVsc2UgaWYgKGVzbGludFRhcmdldHMubGVuZ3RoKSB7XG4gICAgcmV0dXJuIGVzbGludFRhcmdldHM7XG4gIH1cblxuICAvLyBHZXQgdGFyZ2V0cyBmcm9uIGJyb3dzZXJzbGlzdCBjb25maWdzXG4gIHJldHVybiBicm93c2Vyc2xpc3QodW5kZWZpbmVkLCBicm93c2Vyc2xpc3RPcHRzKTtcbn1cblxuLyoqXG4gKiBQYXJzZXMgdGhlIHZlcnNpb25zIHRoYXQgYXJlIGdpdmVuIGJ5IGJyb3dzZXJzbGlzdC4gVGhleSdyZVxuICpcbiAqIGBgYHRzXG4gKiBwYXJzZUJyb3dzZXJzTGlzdFZlcnNpb24oWydjaHJvbWUgNTAnXSlcbiAqXG4gKiB7XG4gKiAgIHRhcmdldDogJ2Nocm9tZScsXG4gKiAgIHBhcnNlZFZlcnNpb246IDUwLFxuICogICB2ZXJzaW9uOiAnNTAnXG4gKiB9XG4gKiBgYGBcbiAqIEBwYXJhbSB0YXJnZXRzbGlzdCAtIExpc3Qgb2YgdGFyZ2VzdCBmcm9tIGJyb3dzZXJzbGlzdCBhcGlcbiAqIEByZXR1cm5zIC0gVGhlIGxvd2VzdCB2ZXJzaW9uIHZlcnNpb24gb2YgZWFjaCB0YXJnZXRcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlQnJvd3NlcnNMaXN0VmVyc2lvbihcbiAgdGFyZ2V0c2xpc3Q6IEFycmF5PHN0cmluZz5cbik6IEFycmF5PFRhcmdldD4ge1xuICByZXR1cm4gKFxuICAgIC8vIFNvcnQgdGhlIHRhcmdldHMgYnkgdGFyZ2V0IG5hbWUgYW5kIHRoZW4gdmVyc2lvbiBudW1iZXIgaW4gYXNjZW5kaW5nIG9yZGVyXG4gICAgdGFyZ2V0c2xpc3RcbiAgICAgIC5tYXAoXG4gICAgICAgIChlOiBzdHJpbmcpOiBUYXJnZXQgPT4ge1xuICAgICAgICAgIGNvbnN0IFt0YXJnZXQsIHZlcnNpb25dID0gZS5zcGxpdChcIiBcIikgYXMgW1xuICAgICAgICAgICAga2V5b2YgVGFyZ2V0TmFtZU1hcHBpbmdzLFxuICAgICAgICAgICAgbnVtYmVyIHwgc3RyaW5nXG4gICAgICAgICAgXTtcblxuICAgICAgICAgIGNvbnN0IHBhcnNlZFZlcnNpb246IG51bWJlciA9ICgoKSA9PiB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIHZlcnNpb24gPT09IFwibnVtYmVyXCIpIHJldHVybiB2ZXJzaW9uO1xuICAgICAgICAgICAgaWYgKHZlcnNpb24gPT09IFwiYWxsXCIpIHJldHVybiAwO1xuICAgICAgICAgICAgcmV0dXJuIHZlcnNpb24uaW5jbHVkZXMoXCItXCIpXG4gICAgICAgICAgICAgID8gcGFyc2VGbG9hdCh2ZXJzaW9uLnNwbGl0KFwiLVwiKVswXSlcbiAgICAgICAgICAgICAgOiBwYXJzZUZsb2F0KHZlcnNpb24pO1xuICAgICAgICAgIH0pKCk7XG5cbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgdGFyZ2V0LFxuICAgICAgICAgICAgdmVyc2lvbixcbiAgICAgICAgICAgIHBhcnNlZFZlcnNpb24sXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgKSAvLyBTb3J0IHRoZSB0YXJnZXRzIGJ5IHRhcmdldCBuYW1lIGFuZCB0aGVuIHZlcnNpb24gbnVtYmVyIGluIGRlc2NlbmRpbmcgb3JkZXJcbiAgICAgIC8vIGV4LiBbYUAzLCBiQDMsIGFAMV0gPT4gW2FAMywgYUAxLCBiQDNdXG4gICAgICAuc29ydCgoYTogVGFyZ2V0LCBiOiBUYXJnZXQpOiBudW1iZXIgPT4ge1xuICAgICAgICBpZiAoYi50YXJnZXQgPT09IGEudGFyZ2V0KSB7XG4gICAgICAgICAgLy8gSWYgYW55IHZlcnNpb24gPT09ICdhbGwnLCByZXR1cm4gMC4gVGhlIG9ubHkgdmVyc2lvbiBvZiBvcF9taW5pIGlzICdhbGwnXG4gICAgICAgICAgLy8gT3RoZXJ3aXNlLCBjb21wYXJlIHRoZSB2ZXJzaW9uc1xuICAgICAgICAgIHJldHVybiB0eXBlb2YgYi5wYXJzZWRWZXJzaW9uID09PSBcInN0cmluZ1wiIHx8XG4gICAgICAgICAgICB0eXBlb2YgYS5wYXJzZWRWZXJzaW9uID09PSBcInN0cmluZ1wiXG4gICAgICAgICAgICA/IDBcbiAgICAgICAgICAgIDogYi5wYXJzZWRWZXJzaW9uIC0gYS5wYXJzZWRWZXJzaW9uO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBiLnRhcmdldCA+IGEudGFyZ2V0ID8gMSA6IC0xO1xuICAgICAgfSkgLy8gRmlyc3QgbGFzdCB0YXJnZXQgYWx3YXlzIGhhcyB0aGUgbGF0ZXN0IHZlcnNpb25cbiAgICAgIC5maWx0ZXIoXG4gICAgICAgIChlOiBUYXJnZXQsIGk6IG51bWJlciwgaXRlbXM6IEFycmF5PFRhcmdldD4pOiBib29sZWFuID0+XG4gICAgICAgICAgLy8gQ2hlY2sgaWYgdGhlIGN1cnJlbnQgdGFyZ2V0IGlzIHRoZSBsYXN0IG9mIGl0cyBraW5kLlxuICAgICAgICAgIC8vIElmIGl0IGlzLCB0aGVuIGl0J3MgdGhlIG1vc3QgcmVjZW50IHZlcnNpb24uXG4gICAgICAgICAgaSArIDEgPT09IGl0ZW1zLmxlbmd0aCB8fCBlLnRhcmdldCAhPT0gaXRlbXNbaSArIDFdLnRhcmdldFxuICAgICAgKVxuICApO1xufVxuIl19
