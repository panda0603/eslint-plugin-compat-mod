'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true,
});
exports.default = void 0;

var _fs = _interopRequireDefault(require('fs'));

var _findUp = _interopRequireDefault(require('find-up'));

var _lodash = _interopRequireDefault(require('lodash.memoize'));

var _helpers = require('../helpers');

var _providers = require('../providers');

function _interopRequireDefault(obj) {
  return obj && obj.__esModule ? obj : { default: obj };
}

/*
 * Step 2) Logic that handles AST traversal
 * Does not handle looking up the API
 * Handles checking what kinds of eslint nodes should be linted
 *   Tells eslint to lint certain nodes  (lintCallExpression, lintMemberExpression, lintNewExpression)
 *   Gets protochain for the ESLint nodes the plugin is interested in
 */
function getName(node) {
  switch (node.type) {
    case 'NewExpression': {
      return node.callee.name;
    }

    case 'MemberExpression': {
      return node.object.name;
    }

    case 'ExpressionStatement': {
      return node.expression.name;
    }

    case 'CallExpression': {
      return node.callee.name;
    }

    default:
      throw new Error('not found');
  }
}

function generateErrorName(rule, context) {
  if (isInInstanceMethod(rule, context))
    return [rule.protoChain[0], '.prototype.', rule.protoChain[1]].join('');
  if (rule.name) return rule.name;
  if (rule.property) return `${rule.object}.${rule.property}()`;
  return rule.object;
}

const getPolyfillSet = (0, _lodash.default)(
  (polyfillArrayJSON) => new Set(JSON.parse(polyfillArrayJSON))
);

function isPolyfilled(context, rule) {
  var _context$settings;

  if (
    !((_context$settings = context.settings) === null ||
    _context$settings === void 0
      ? void 0
      : _context$settings.polyfills)
  )
    return false;
  const polyfills = getPolyfillSet(JSON.stringify(context.settings.polyfills));
  return (
    // v2 allowed users to select polyfills based off their caniuseId. This is
    polyfills.has(rule.id) || // no longer supported. Keeping this here to avoid breaking changes.
    polyfills.has(rule.protoChainId) || // Check if polyfill is provided (ex. `Promise.all`)
    polyfills.has(rule.protoChain[0]) // Check if entire API is polyfilled (ex. `Promise`)
  );
}

const items = [
  // Babel configs
  'babel.config.json',
  'babel.config.js',
  '.babelrc',
  '.babelrc.json',
  '.babelrc.js',
];
/**
 * Determine if a user has a TS or babel config. This is used to infer if a user is transpiling their code.
 * If transpiling code, do not lint ES APIs. We assume that all transpiled code is polyfilled.
 * @TODO Use @babel/core to find config. See https://github.com/babel/babel/discussions/11602
 * @param dir @
 */

function isUsingTranspiler(context) {
  var _context$parserOption;

  // If tsconfig config exists in parser options, assume transpilation
  if (
    ((_context$parserOption = context.parserOptions) === null ||
    _context$parserOption === void 0
      ? void 0
      : _context$parserOption.tsconfigRootDir) === true
  )
    return true;
  const dir = context.getFilename();

  const configPath = _findUp.default.sync(items, {
    cwd: dir,
  });

  if (configPath) return true;

  const pkgPath = _findUp.default.sync('package.json', {
    cwd: dir,
  }); // Check if babel property exists

  if (pkgPath) {
    const pkg = JSON.parse(_fs.default.readFileSync(pkgPath).toString());
    return !!pkg.babel;
  }

  return false;
}

const isInInstanceMethod = (node, context) => {
  const instanceSet = getPolyfillSet(
    JSON.stringify(context.settings.instances)
  );
  const instanceArr = [...instanceSet];
  const propertyName = node.protoChainId;
  return instanceArr.some((object) => object.includes(propertyName));
};

var _default = {
  meta: {
    docs: {
      description: 'Ensure cross-browser API compatibility',
      category: 'Compatibility',
      url:
        'https://github.com/amilajack/eslint-plugin-compat/blob/master/docs/rules/compat.md',
      recommended: true,
    },
    type: 'problem',
    schema: [
      {
        type: 'string',
      },
    ],
  },

  create(context) {
    var _context$settings2,
      _context$settings3,
      _context$settings4,
      _context$settings5,
      _context$settings5$po;

    // Determine lowest targets from browserslist config, which reads user's
    // package.json config section. Use config from eslintrc for testing purposes
    const browserslistConfig =
      ((_context$settings2 = context.settings) === null ||
      _context$settings2 === void 0
        ? void 0
        : _context$settings2.browsers) ||
      ((_context$settings3 = context.settings) === null ||
      _context$settings3 === void 0
        ? void 0
        : _context$settings3.targets) ||
      context.options[0];
    const lintAllEsApis =
      ((_context$settings4 = context.settings) === null ||
      _context$settings4 === void 0
        ? void 0
        : _context$settings4.lintAllEsApis) === true || // Attempt to infer polyfilling of ES APIs from ts or babel config
      (!((_context$settings5 = context.settings) === null ||
      _context$settings5 === void 0
        ? void 0
        : (_context$settings5$po = _context$settings5.polyfills) === null ||
          _context$settings5$po === void 0
        ? void 0
        : _context$settings5$po.includes('es:all')) &&
        !isUsingTranspiler(context));
    const browserslistTargets = (0, _helpers.parseBrowsersListVersion)(
      (0, _helpers.determineTargetsFromConfig)(
        context.getFilename(),
        browserslistConfig
      )
    );

    /**
     * A small optimization that only lints APIs that are not supported by targeted browsers.
     * For example, if the user is targeting chrome 50, which supports the fetch API, it is
     * wasteful to lint calls to fetch.
     */
    const getRulesForTargets = (0, _lodash.default)((targetsJSON) => {
      const result = {
        CallExpression: [],
        NewExpression: [],
        MemberExpression: [],
        ExpressionStatement: [],
      };
      const targets = JSON.parse(targetsJSON);

      _providers.nodes
        .filter((node) => {
          return lintAllEsApis ? true : node.kind !== 'es';
        })
        .forEach((node) => {
          if (!node.getUnsupportedTargets(node, targets).length) return;
          result[node.astNodeType].push(node);
        });

      return result;
    }); // Stringify to support memoization; browserslistConfig is always an array of new objects.

    const targetedRules = getRulesForTargets(
      JSON.stringify(browserslistTargets)
    );
    const errors = [];

    const handleFailingRule = (node, eslintNode) => {
      if (isPolyfilled(context, node)) return;
      errors.push({
        node: eslintNode,
        message: [
          generateErrorName(node, context),
          'is not supported in',
          node.getUnsupportedTargets(node, browserslistTargets).join(', '),
        ].join(' '),
      });
    };

    const filterDuplicateErrors = (errors) => {
      return errors.filter(
        (error, index, arr) =>
          arr.findIndex((e) => e.message === error.message) === index
      );
    };

    const identifiers = new Set();
    return {
      CallExpression: _helpers.lintCallExpression.bind(
        null,
        context,
        handleFailingRule,
        targetedRules.CallExpression
      ),
      NewExpression: _helpers.lintNewExpression.bind(
        null,
        context,
        handleFailingRule,
        targetedRules.NewExpression
      ),
      ExpressionStatement: _helpers.lintExpressionStatement.bind(
        null,
        context,
        handleFailingRule,
        [...targetedRules.MemberExpression, ...targetedRules.CallExpression]
      ),
      MemberExpression: _helpers.lintMemberExpression.bind(
        null,
        context,
        handleFailingRule,
        [
          ...targetedRules.MemberExpression,
          ...targetedRules.CallExpression,
          ...targetedRules.NewExpression,
        ]
      ),

      // Keep track of all the defined variables. Do not report errors for nodes that are not defined
      Identifier(node) {
        if (node.parent) {
          const { type } = node.parent;

          if (
            type === 'Property' || // ex. const { Set } = require('immutable');
            type === 'FunctionDeclaration' || // ex. function Set() {}
            type === 'VariableDeclarator' || // ex. const Set = () => {}
            type === 'ClassDeclaration' || // ex. class Set {}
            type === 'ImportDefaultSpecifier' || // ex. import Set from 'set';
            type === 'ImportSpecifier' || // ex. import {Set} from 'set';
            type === 'ImportDeclaration' // ex. import {Set} from 'set';
          ) {
            identifiers.add(node.name);
          }
        }
      },

      'Program:exit': () => {
        // Get a map of all the variables defined in the root scope (not the global scope)
        // const variablesMap = context.getScope().childScopes.map(e => e.set)[0];
        // const filteredErrors = filterDuplicateErrors(errors);
        // filteredErrors.forEach((node) => context.report(node));
        errors.forEach((node) => context.report(node));
      },
    };
  },
};
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9ydWxlcy9jb21wYXQudHMiXSwibmFtZXMiOlsiZ2V0TmFtZSIsIm5vZGUiLCJ0eXBlIiwiY2FsbGVlIiwibmFtZSIsIm9iamVjdCIsImV4cHJlc3Npb24iLCJFcnJvciIsImdlbmVyYXRlRXJyb3JOYW1lIiwicnVsZSIsInByb3BlcnR5IiwiZ2V0UG9seWZpbGxTZXQiLCJwb2x5ZmlsbEFycmF5SlNPTiIsIlNldCIsIkpTT04iLCJwYXJzZSIsImlzUG9seWZpbGxlZCIsImNvbnRleHQiLCJzZXR0aW5ncyIsInBvbHlmaWxscyIsInN0cmluZ2lmeSIsImhhcyIsImlkIiwicHJvdG9DaGFpbklkIiwicHJvdG9DaGFpbiIsIml0ZW1zIiwiaXNVc2luZ1RyYW5zcGlsZXIiLCJwYXJzZXJPcHRpb25zIiwidHNjb25maWdSb290RGlyIiwiZGlyIiwiZ2V0RmlsZW5hbWUiLCJjb25maWdQYXRoIiwiZmluZFVwIiwic3luYyIsImN3ZCIsInBrZ1BhdGgiLCJwa2ciLCJmcyIsInJlYWRGaWxlU3luYyIsInRvU3RyaW5nIiwiYmFiZWwiLCJtZXRhIiwiZG9jcyIsImRlc2NyaXB0aW9uIiwiY2F0ZWdvcnkiLCJ1cmwiLCJyZWNvbW1lbmRlZCIsInNjaGVtYSIsImNyZWF0ZSIsImJyb3dzZXJzbGlzdENvbmZpZyIsImJyb3dzZXJzIiwidGFyZ2V0cyIsIm9wdGlvbnMiLCJsaW50QWxsRXNBcGlzIiwiaW5jbHVkZXMiLCJicm93c2Vyc2xpc3RUYXJnZXRzIiwiZ2V0UnVsZXNGb3JUYXJnZXRzIiwidGFyZ2V0c0pTT04iLCJyZXN1bHQiLCJDYWxsRXhwcmVzc2lvbiIsIk5ld0V4cHJlc3Npb24iLCJNZW1iZXJFeHByZXNzaW9uIiwiRXhwcmVzc2lvblN0YXRlbWVudCIsIm5vZGVzIiwiZmlsdGVyIiwia2luZCIsImZvckVhY2giLCJnZXRVbnN1cHBvcnRlZFRhcmdldHMiLCJsZW5ndGgiLCJhc3ROb2RlVHlwZSIsInB1c2giLCJ0YXJnZXRlZFJ1bGVzIiwiZXJyb3JzIiwiaGFuZGxlRmFpbGluZ1J1bGUiLCJlc2xpbnROb2RlIiwibWVzc2FnZSIsImpvaW4iLCJpZGVudGlmaWVycyIsImxpbnRDYWxsRXhwcmVzc2lvbiIsImJpbmQiLCJsaW50TmV3RXhwcmVzc2lvbiIsImxpbnRFeHByZXNzaW9uU3RhdGVtZW50IiwibGludE1lbWJlckV4cHJlc3Npb24iLCJJZGVudGlmaWVyIiwicGFyZW50IiwiYWRkIiwiZXJyb3IiLCJyZXBvcnQiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFPQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFlQTs7OztBQXpCQTs7Ozs7OztBQStCQSxTQUFTQSxPQUFULENBQWlCQyxJQUFqQixFQUEyQztBQUN6QyxVQUFRQSxJQUFJLENBQUNDLElBQWI7QUFDRSxTQUFLLGVBQUw7QUFBc0I7QUFDcEIsZUFBT0QsSUFBSSxDQUFDRSxNQUFMLENBQVlDLElBQW5CO0FBQ0Q7O0FBQ0QsU0FBSyxrQkFBTDtBQUF5QjtBQUN2QixlQUFPSCxJQUFJLENBQUNJLE1BQUwsQ0FBWUQsSUFBbkI7QUFDRDs7QUFDRCxTQUFLLHFCQUFMO0FBQTRCO0FBQzFCLGVBQU9ILElBQUksQ0FBQ0ssVUFBTCxDQUFnQkYsSUFBdkI7QUFDRDs7QUFDRCxTQUFLLGdCQUFMO0FBQXVCO0FBQ3JCLGVBQU9ILElBQUksQ0FBQ0UsTUFBTCxDQUFZQyxJQUFuQjtBQUNEOztBQUNEO0FBQ0UsWUFBTSxJQUFJRyxLQUFKLENBQVUsV0FBVixDQUFOO0FBZEo7QUFnQkQ7O0FBRUQsU0FBU0MsaUJBQVQsQ0FBMkJDLElBQTNCLEVBQTRFO0FBQzFFLE1BQUlBLElBQUksQ0FBQ0wsSUFBVCxFQUFlLE9BQU9LLElBQUksQ0FBQ0wsSUFBWjtBQUNmLE1BQUlLLElBQUksQ0FBQ0MsUUFBVCxFQUFtQixPQUFRLEdBQUVELElBQUksQ0FBQ0osTUFBTyxJQUFHSSxJQUFJLENBQUNDLFFBQVMsSUFBdkM7QUFDbkIsU0FBT0QsSUFBSSxDQUFDSixNQUFaO0FBQ0Q7O0FBRUQsTUFBTU0sY0FBYyxHQUFH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LEdBQUdZLGFBQWEsQ0FBQ1gsYUFIbkIsQ0FKZ0IsQ0FuQmI7O0FBNkJMO0FBQ0F1QixNQUFBQSxVQUFVLENBQUNsRixJQUFELEVBQW1CO0FBQzNCLFlBQUlBLElBQUksQ0FBQ21GLE1BQVQsRUFBaUI7QUFDZixnQkFBTTtBQUFFbEYsWUFBQUE7QUFBRixjQUFXRCxJQUFJLENBQUNtRixNQUF0Qjs7QUFDQSxjQUNFbEYsSUFBSSxLQUFLLFVBQVQsSUFBdUI7QUFDdkJBLFVBQUFBLElBQUksS0FBSyxxQkFEVCxJQUNrQztBQUNsQ0EsVUFBQUEsSUFBSSxLQUFLLG9CQUZULElBRWlDO0FBQ2pDQSxVQUFBQSxJQUFJLEtBQUssa0JBSFQsSUFHK0I7QUFDL0JBLFVBQUFBLElBQUksS0FBSyx3QkFKVCxJQUlxQztBQUNyQ0EsVUFBQUEsSUFBSSxLQUFLLGlCQUxULElBSzhCO0FBQzlCQSxVQUFBQSxJQUFJLEtBQUssbUJBUFgsQ0FPK0I7QUFQL0IsWUFRRTtBQUNBMkUsY0FBQUEsV0FBVyxDQUFDUSxHQUFaLENBQWdCcEYsSUFBSSxDQUFDRyxJQUFyQjtBQUNEO0FBQ0Y7QUFDRixPQTdDSTs7QUE4Q0wsc0JBQWdCLE1BQU07QUFDcEI7QUFDQTtBQUNBb0UsUUFBQUEsTUFBTSxDQUNIUixNQURILENBQ1dzQixLQUFELElBQVcsQ0FBQ1QsV0FBVyxDQUFDeEQsR0FBWixDQUFnQnJCLE9BQU8sQ0FBQ3NGLEtBQUssQ0FBQ3JGLElBQVAsQ0FBdkIsQ0FEdEIsRUFFR2lFLE9BRkgsQ0FFWWpFLElBQUQsSUFBVWdCLE9BQU8sQ0FBQ3NFLE1BQVIsQ0FBZXRGLElBQWYsQ0FGckI7QUFHRDtBQXBESSxLQUFQO0FBc0REOztBQW5KWSxDIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIFN0ZXAgMikgTG9naWMgdGhhdCBoYW5kbGVzIEFTVCB0cmF2ZXJzYWxcbiAqIERvZXMgbm90IGhhbmRsZSBsb29raW5nIHVwIHRoZSBBUElcbiAqIEhhbmRsZXMgY2hlY2tpbmcgd2hhdCBraW5kcyBvZiBlc2xpbnQgbm9kZXMgc2hvdWxkIGJlIGxpbnRlZFxuICogICBUZWxscyBlc2xpbnQgdG8gbGludCBjZXJ0YWluIG5vZGVzICAobGludENhbGxFeHByZXNzaW9uLCBsaW50TWVtYmVyRXhwcmVzc2lvbiwgbGludE5ld0V4cHJlc3Npb24pXG4gKiAgIEdldHMgcHJvdG9jaGFpbiBmb3IgdGhlIEVTTGludCBub2RlcyB0aGUgcGx1Z2luIGlzIGludGVyZXN0ZWQgaW5cbiAqL1xuaW1wb3J0IGZzIGZyb20gXCJmc1wiO1xuaW1wb3J0IGZpbmRVcCBmcm9tIFwiZmluZC11cFwiO1xuaW1wb3J0IG1lbW9pemUgZnJvbSBcImxvZGFzaC5tZW1vaXplXCI7XG5pbXBvcnQge1xuICBsaW50Q2FsbEV4cHJlc3Npb24sXG4gIGxpbnRNZW1iZXJFeHByZXNzaW9uLFxuICBsaW50TmV3RXhwcmVzc2lvbixcbiAgbGludEV4cHJlc3Npb25TdGF0ZW1lbnQsXG4gIHBhcnNlQnJvd3NlcnNMaXN0VmVyc2lvbixcbiAgZGV0ZXJtaW5lVGFyZ2V0c0Zyb21Db25maWcsXG59IGZyb20gXCIuLi9oZWxwZXJzXCI7IC8vIHdpbGwgYmUgZGVwcmVjYXRlZCBhbmQgaW50cm9kdWNlZCB0byB0aGlzIGZpbGVcbmltcG9ydCB7XG4gIEVTTGludE5vZGUsXG4gIEFzdE1ldGFkYXRhQXBpV2l0aFRhcmdldHNSZXNvbHZlcixcbiAgQnJvd3Nlckxpc3RDb25maWcsXG4gIEhhbmRsZUZhaWxpbmdSdWxlLFxuICBDb250ZXh0LFxufSBmcm9tIFwiLi4vdHlwZXNcIjtcbmltcG9ydCB7IG5vZGVzIH0gZnJvbSBcIi4uL3Byb3ZpZGVyc1wiO1xuXG50eXBlIEVTTGludCA9IHtcbiAgW2FzdE5vZGVUeXBlTmFtZTogc3RyaW5nXTogKG5vZGU6IEVTTGludE5vZGUpID0+IHZvaWQ7XG59O1xuXG5mdW5jdGlvbiBnZXROYW1lKG5vZGU6IEVTTGludE5vZGUpOiBzdHJpbmcge1xuICBzd2l0Y2ggKG5vZGUudHlwZSkge1xuICAgIGNhc2UgXCJOZXdFeHByZXNzaW9uXCI6IHtcbiAgICAgIHJldHVybiBub2RlLmNhbGxlZS5uYW1lO1xuICAgIH1cbiAgICBjYXNlIFwiTWVtYmVyRXhwcmVzc2lvblwiOiB7XG4gICAgICByZXR1cm4gbm9kZS5vYmplY3QubmFtZTtcbiAgICB9XG4gICAgY2FzZSBcIkV4cHJlc3Npb25TdGF0ZW1lbnRcIjoge1xuICAgICAgcmV0dXJuIG5vZGUuZXhwcmVzc2lvbi5uYW1lO1xuICAgIH1cbiAgICBjYXNlIFwiQ2FsbEV4cHJlc3Npb25cIjoge1xuICAgICAgcmV0dXJuIG5vZGUuY2FsbGVlLm5hbWU7XG4gICAgfVxuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJub3QgZm91bmRcIik7XG4gIH1cbn1cblxuZnVuY3Rpb24gZ2VuZXJhdGVFcnJvck5hbWUocnVsZTogQXN0TWV0YWRhdGFBcGlXaXRoVGFyZ2V0c1Jlc29sdmVyKTogc3RyaW5nIHtcbiAgaWYgKHJ1bGUubmFtZSkgcmV0dXJuIHJ1bGUubmFtZTtcbiAgaWYgKHJ1bGUucHJvcGVydHkpIHJldHVybiBgJHtydWxlLm9iamVjdH0uJHtydWxlLnByb3BlcnR5fSgpYDtcbiAgcmV0dXJuIHJ1bGUub2JqZWN0O1xufVxuXG5jb25zdCBnZXRQb2x5ZmlsbFNldCA9IG1lbW9pemUoXG4gIChwb2x5ZmlsbEFycmF5SlNPTjogc3RyaW5nKTogU2V0PFN0cmluZz4gPT5cbiAgICBuZXcgU2V0KEpTT04ucGFyc2UocG9seWZpbGxBcnJheUpTT04pKVxuKTtcblxuZnVuY3Rpb24gaXNQb2x5ZmlsbGVkKFxuICBjb250ZXh0OiBDb250ZXh0LFxuICBydWxlOiBBc3RNZXRhZGF0YUFwaVdpdGhUYXJnZXRzUmVzb2x2ZXJcbik6IGJvb2xlYW4ge1xuICBpZiAoIWNvbnRleHQuc2V0dGluZ3M/LnBvbHlmaWxscykgcmV0dXJuIGZhbHNlO1xuICBjb25zdCBwb2x5ZmlsbHMgPSBnZXRQb2x5ZmlsbFNldChKU09OLnN0cmluZ2lmeShjb250ZXh0LnNldHRpbmdzLnBvbHlmaWxscykpO1xuICByZXR1cm4gKFxuICAgIC8vIHYyIGFsbG93ZWQgdXNlcnMgdG8gc2VsZWN0IHBvbHlmaWxscyBiYXNlZCBvZmYgdGhlaXIgY2FuaXVzZUlkLiBUaGlzIGlzXG4gICAgcG9seWZpbGxzLmhhcyhydWxlLmlkKSB8fCAvLyBubyBsb25nZXIgc3VwcG9ydGVkLiBLZWVwaW5nIHRoaXMgaGVyZSB0byBhdm9pZCBicmVha2luZyBjaGFuZ2VzLlxuICAgIHBvbHlmaWxscy5oYXMocnVsZS5wcm90b0NoYWluSWQpIHx8IC8vIENoZWNrIGlmIHBvbHlmaWxsIGlzIHByb3ZpZGVkIChleC4gYFByb21pc2UuYWxsYClcbiAgICBwb2x5ZmlsbHMuaGFzKHJ1bGUucHJvdG9DaGFpblswXSkgLy8gQ2hlY2sgaWYgZW50aXJlIEFQSSBpcyBwb2x5ZmlsbGVkIChleC4gYFByb21pc2VgKVxuICApO1xufVxuXG5jb25zdCBpdGVtcyA9IFtcbiAgLy8gQmFiZWwgY29uZmlnc1xuICBcImJhYmVsLmNvbmZpZy5qc29uXCIsXG4gIFwiYmFiZWwuY29uZmlnLmpzXCIsXG4gIFwiLmJhYmVscmNcIixcbiAgXCIuYmFiZWxyYy5qc29uXCIsXG4gIFwiLmJhYmVscmMuanNcIixcbiAgLy8gVFMgY29uZmlnc1xuICBcInRzY29uZmlnLmpzb25cIixcbl07XG5cbi8qKlxuICogRGV0ZXJtaW5lIGlmIGEgdXNlciBoYXMgYSBUUyBvciBiYWJlbCBjb25maWcuIFRoaXMgaXMgdXNlZCB0byBpbmZlciBpZiBhIHVzZXIgaXMgdHJhbnNwaWxpbmcgdGhlaXIgY29kZS5cbiAqIElmIHRyYW5zcGlsaW5nIGNvZGUsIGRvIG5vdCBsaW50IEVTIEFQSXMuIFdlIGFzc3VtZSB0aGF0IGFsbCB0cmFuc3BpbGVkIGNvZGUgaXMgcG9seWZpbGxlZC5cbiAqIEBUT0RPIFVzZSBAYmFiZWwvY29yZSB0byBmaW5kIGNvbmZpZy4gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9iYWJlbC9iYWJlbC9kaXNjdXNzaW9ucy8xMTYwMlxuICogQHBhcmFtIGRpciBAXG4gKi9cbmZ1bmN0aW9uIGlzVXNpbmdUcmFuc3BpbGVyKGNvbnRleHQ6IENvbnRleHQpOiBib29sZWFuIHtcbiAgLy8gSWYgdHNjb25maWcgY29uZmlnIGV4aXN0cyBpbiBwYXJzZXIgb3B0aW9ucywgYXNzdW1lIHRyYW5zcGlsYXRpb25cbiAgaWYgKGNvbnRleHQucGFyc2VyT3B0aW9ucz8udHNjb25maWdSb290RGlyID09PSB0cnVlKSByZXR1cm4gdHJ1ZTtcbiAgY29uc3QgZGlyID0gY29udGV4dC5nZXRGaWxlbmFtZSgpO1xuICBjb25zdCBjb25maWdQYXRoID0gZmluZFVwLnN5bmMoaXRlbXMsIHtcbiAgICBjd2Q6IGRpcixcbiAgfSk7XG4gIGlmIChjb25maWdQYXRoKSByZXR1cm4gdHJ1ZTtcbiAgY29uc3QgcGtnUGF0aCA9IGZpbmRVcC5zeW5jKFwicGFja2FnZS5qc29uXCIsIHtcbiAgICBjd2Q6IGRpcixcbiAgfSk7XG4gIC8vIENoZWNrIGlmIGJhYmVsIHByb3BlcnR5IGV4aXN0c1xuICBpZiAocGtnUGF0aCkge1xuICAgIGNvbnN0IHBrZyA9IEpTT04ucGFyc2UoZnMucmVhZEZpbGVTeW5jKHBrZ1BhdGgpLnRvU3RyaW5nKCkpO1xuICAgIHJldHVybiAhIXBrZy5iYWJlbDtcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59XG5cbmV4cG9ydCBkZWZhdWx0IHtcbiAgbWV0YToge1xuICAgIGRvY3M6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiBcIkVuc3VyZSBjcm9zcy1icm93c2VyIEFQSSBjb21wYXRpYmlsaXR5XCIsXG4gICAgICBjYXRlZ29yeTogXCJDb21wYXRpYmlsaXR5XCIsXG4gICAgICB1cmw6XG4gICAgICAgIFwiaHR0cHM6Ly9naXRodWIuY29tL2FtaWxhamFjay9lc2xpbnQtcGx1Z2luLWNvbXBhdC9ibG9iL21hc3Rlci9kb2NzL3J1bGVzL2NvbXBhdC5tZFwiLFxuICAgICAgcmVjb21tZW5kZWQ6IHRydWUsXG4gICAgfSxcbiAgICB0eXBlOiBcInByb2JsZW1cIixcbiAgICBzY2hlbWE6IFt7IHR5cGU6IFwic3RyaW5nXCIgfV0sXG4gIH0sXG4gIGNyZWF0ZShjb250ZXh0OiBDb250ZXh0KTogRVNMaW50IHtcbiAgICAvLyBEZXRlcm1pbmUgbG93ZXN0IHRhcmdldHMgZnJvbSBicm93c2Vyc2xpc3QgY29uZmlnLCB3aGljaCByZWFkcyB1c2VyJ3NcbiAgICAvLyBwYWNrYWdlLmpzb24gY29uZmlnIHNlY3Rpb24uIFVzZSBjb25maWcgZnJvbSBlc2xpbnRyYyBmb3IgdGVzdGluZyBwdXJwb3Nlc1xuICAgIGNvbnN0IGJyb3dzZXJzbGlzdENvbmZpZzogQnJvd3Nlckxpc3RDb25maWcgPVxuICAgICAgY29udGV4dC5zZXR0aW5ncz8uYnJvd3NlcnMgfHxcbiAgICAgIGNvbnRleHQuc2V0dGluZ3M/LnRhcmdldHMgfHxcbiAgICAgIGNvbnRleHQub3B0aW9uc1swXTtcblxuICAgIGNvbnN0IGxpbnRBbGxFc0FwaXM6IGJvb2xlYW4gPVxuICAgICAgY29udGV4dC5zZXR0aW5ncz8ubGludEFsbEVzQXBpcyA9PT0gdHJ1ZSB8fFxuICAgICAgLy8gQXR0ZW1wdCB0byBpbmZlciBwb2x5ZmlsbGluZyBvZiBFUyBBUElzIGZyb20gdHMgb3IgYmFiZWwgY29uZmlnXG4gICAgICAoIWNvbnRleHQuc2V0dGluZ3M/LnBvbHlmaWxscz8uaW5jbHVkZXMoXCJlczphbGxcIikgJiZcbiAgICAgICAgIWlzVXNpbmdUcmFuc3BpbGVyKGNvbnRleHQpKTtcbiAgICBjb25zdCBicm93c2Vyc2xpc3RUYXJnZXRzID0gcGFyc2VCcm93c2Vyc0xpc3RWZXJzaW9uKFxuICAgICAgZGV0ZXJtaW5lVGFyZ2V0c0Zyb21Db25maWcoY29udGV4dC5nZXRGaWxlbmFtZSgpLCBicm93c2Vyc2xpc3RDb25maWcpXG4gICAgKTtcblxuICAgIHR5cGUgUnVsZXNGaWx0ZXJlZEJ5VGFyZ2V0cyA9IHtcbiAgICAgIENhbGxFeHByZXNzaW9uOiBBc3RNZXRhZGF0YUFwaVdpdGhUYXJnZXRzUmVzb2x2ZXJbXTtcbiAgICAgIE5ld0V4cHJlc3Npb246IEFzdE1ldGFkYXRhQXBpV2l0aFRhcmdldHNSZXNvbHZlcltdO1xuICAgICAgTWVtYmVyRXhwcmVzc2lvbjogQXN0TWV0YWRhdGFBcGlXaXRoVGFyZ2V0c1Jlc29sdmVyW107XG4gICAgICBFeHByZXNzaW9uU3RhdGVtZW50OiBBc3RNZXRhZGF0YUFwaVdpdGhUYXJnZXRzUmVzb2x2ZXJbXTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogQSBzbWFsbCBvcHRpbWl6YXRpb24gdGhhdCBvbmx5IGxpbnRzIEFQSXMgdGhhdCBhcmUgbm90IHN1cHBvcnRlZCBieSB0YXJnZXRlZCBicm93c2Vycy5cbiAgICAgKiBGb3IgZXhhbXBsZSwgaWYgdGhlIHVzZXIgaXMgdGFyZ2V0aW5nIGNocm9tZSA1MCwgd2hpY2ggc3VwcG9ydHMgdGhlIGZldGNoIEFQSSwgaXQgaXNcbiAgICAgKiB3YXN0ZWZ1bCB0byBsaW50IGNhbGxzIHRvIGZldGNoLlxuICAgICAqL1xuICAgIGNvbnN0IGdldFJ1bGVzRm9yVGFyZ2V0cyA9IG1lbW9pemUoXG4gICAgICAodGFyZ2V0c0pTT046IHN0cmluZyk6IFJ1bGVzRmlsdGVyZWRCeVRhcmdldHMgPT4ge1xuICAgICAgICBjb25zdCByZXN1bHQgPSB7XG4gICAgICAgICAgQ2FsbEV4cHJlc3Npb246IFtdLFxuICAgICAgICAgIE5ld0V4cHJlc3Npb246IFtdLFxuICAgICAgICAgIE1lbWJlckV4cHJlc3Npb246IFtdLFxuICAgICAgICAgIEV4cHJlc3Npb25TdGF0ZW1lbnQ6IFtdLFxuICAgICAgICB9O1xuICAgICAgICBjb25zdCB0YXJnZXRzID0gSlNPTi5wYXJzZSh0YXJnZXRzSlNPTik7XG5cbiAgICAgICAgbm9kZXNcbiAgICAgICAgICAuZmlsdGVyKChub2RlKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gbGludEFsbEVzQXBpcyA/IHRydWUgOiBub2RlLmtpbmQgIT09IFwiZXNcIjtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC5mb3JFYWNoKChub2RlKSA9PiB7XG4gICAgICAgICAgICBpZiAoIW5vZGUuZ2V0VW5zdXBwb3J0ZWRUYXJnZXRzKG5vZGUsIHRhcmdldHMpLmxlbmd0aCkgcmV0dXJuO1xuICAgICAgICAgICAgcmVzdWx0W25vZGUuYXN0Tm9kZVR5cGUgYXMga2V5b2YgUnVsZXNGaWx0ZXJlZEJ5VGFyZ2V0c10ucHVzaChub2RlKTtcbiAgICAgICAgICB9KTtcblxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgfVxuICAgICk7XG5cbiAgICAvLyBTdHJpbmdpZnkgdG8gc3VwcG9ydCBtZW1vaXphdGlvbjsgYnJvd3NlcnNsaXN0Q29uZmlnIGlzIGFsd2F5cyBhbiBhcnJheSBvZiBuZXcgb2JqZWN0cy5cbiAgICBjb25zdCB0YXJnZXRlZFJ1bGVzID0gZ2V0UnVsZXNGb3JUYXJnZXRzKFxuICAgICAgSlNPTi5zdHJpbmdpZnkoYnJvd3NlcnNsaXN0VGFyZ2V0cylcbiAgICApO1xuXG4gICAgdHlwZSBFcnJvciA9IHtcbiAgICAgIG1lc3NhZ2U6IHN0cmluZztcbiAgICAgIG5vZGU6IEVTTGludE5vZGU7XG4gICAgfTtcblxuICAgIGNvbnN0IGVycm9yczogRXJyb3JbXSA9IFtdO1xuXG4gICAgY29uc3QgaGFuZGxlRmFpbGluZ1J1bGU6IEhhbmRsZUZhaWxpbmdSdWxlID0gKFxuICAgICAgbm9kZTogQXN0TWV0YWRhdGFBcGlXaXRoVGFyZ2V0c1Jlc29sdmVyLFxuICAgICAgZXNsaW50Tm9kZTogRVNMaW50Tm9kZVxuICAgICkgPT4ge1xuICAgICAgaWYgKGlzUG9seWZpbGxlZChjb250ZXh0LCBub2RlKSkgcmV0dXJuO1xuICAgICAgZXJyb3JzLnB1c2goe1xuICAgICAgICBub2RlOiBlc2xpbnROb2RlLFxuICAgICAgICBtZXNzYWdlOiBbXG4gICAgICAgICAgZ2VuZXJhdGVFcnJvck5hbWUobm9kZSksXG4gICAgICAgICAgXCJpcyBub3Qgc3VwcG9ydGVkIGluXCIsXG4gICAgICAgICAgbm9kZS5nZXRVbnN1cHBvcnRlZFRhcmdldHMobm9kZSwgYnJvd3NlcnNsaXN0VGFyZ2V0cykuam9pbihcIiwgXCIpLFxuICAgICAgICBdLmpvaW4oXCIgXCIpLFxuICAgICAgfSk7XG4gICAgfTtcblxuICAgIGNvbnN0IGlkZW50aWZpZXJzID0gbmV3IFNldCgpO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIENhbGxFeHByZXNzaW9uOiBsaW50Q2FsbEV4cHJlc3Npb24uYmluZChcbiAgICAgICAgbnVsbCxcbiAgICAgICAgY29udGV4dCxcbiAgICAgICAgaGFuZGxlRmFpbGluZ1J1bGUsXG4gICAgICAgIHRhcmdldGVkUnVsZXMuQ2FsbEV4cHJlc3Npb25cbiAgICAgICksXG4gICAgICBOZXdFeHByZXNzaW9uOiBsaW50TmV3RXhwcmVzc2lvbi5iaW5kKFxuICAgICAgICBudWxsLFxuICAgICAgICBjb250ZXh0LFxuICAgICAgICBoYW5kbGVGYWlsaW5nUnVsZSxcbiAgICAgICAgdGFyZ2V0ZWRSdWxlcy5OZXdFeHByZXNzaW9uXG4gICAgICApLFxuICAgICAgRXhwcmVzc2lvblN0YXRlbWVudDogbGludEV4cHJlc3Npb25TdGF0ZW1lbnQuYmluZChcbiAgICAgICAgbnVsbCxcbiAgICAgICAgY29udGV4dCxcbiAgICAgICAgaGFuZGxlRmFpbGluZ1J1bGUsXG4gICAgICAgIFsuLi50YXJnZXRlZFJ1bGVzLk1lbWJlckV4cHJlc3Npb24sIC4uLnRhcmdldGVkUnVsZXMuQ2FsbEV4cHJlc3Npb25dXG4gICAgICApLFxuICAgICAgTWVtYmVyRXhwcmVzc2lvbjogbGludE1lbWJlckV4cHJlc3Npb24uYmluZChcbiAgICAgICAgbnVsbCxcbiAgICAgICAgY29udGV4dCxcbiAgICAgICAgaGFuZGxlRmFpbGluZ1J1bGUsXG4gICAgICAgIFtcbiAgICAgICAgICAuLi50YXJnZXRlZFJ1bGVzLk1lbWJlckV4cHJlc3Npb24sXG4gICAgICAgICAgLi4udGFyZ2V0ZWRSdWxlcy5DYWxsRXhwcmVzc2lvbixcbiAgICAgICAgICAuLi50YXJnZXRlZFJ1bGVzLk5ld0V4cHJlc3Npb24sXG4gICAgICAgIF1cbiAgICAgICksXG4gICAgICAvLyBLZWVwIHRyYWNrIG9mIGFsbCB0aGUgZGVmaW5lZCB2YXJpYWJsZXMuIERvIG5vdCByZXBvcnQgZXJyb3JzIGZvciBub2RlcyB0aGF0IGFyZSBub3QgZGVmaW5lZFxuICAgICAgSWRlbnRpZmllcihub2RlOiBFU0xpbnROb2RlKSB7XG4gICAgICAgIGlmIChub2RlLnBhcmVudCkge1xuICAgICAgICAgIGNvbnN0IHsgdHlwZSB9ID0gbm9kZS5wYXJlbnQ7XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgdHlwZSA9PT0gXCJQcm9wZXJ0eVwiIHx8IC8vIGV4LiBjb25zdCB7IFNldCB9ID0gcmVxdWlyZSgnaW1tdXRhYmxlJyk7XG4gICAgICAgICAgICB0eXBlID09PSBcIkZ1bmN0aW9uRGVjbGFyYXRpb25cIiB8fCAvLyBleC4gZnVuY3Rpb24gU2V0KCkge31cbiAgICAgICAgICAgIHR5cGUgPT09IFwiVmFyaWFibGVEZWNsYXJhdG9yXCIgfHwgLy8gZXguIGNvbnN0IFNldCA9ICgpID0+IHt9XG4gICAgICAgICAgICB0eXBlID09PSBcIkNsYXNzRGVjbGFyYXRpb25cIiB8fCAvLyBleC4gY2xhc3MgU2V0IHt9XG4gICAgICAgICAgICB0eXBlID09PSBcIkltcG9ydERlZmF1bHRTcGVjaWZpZXJcIiB8fCAvLyBleC4gaW1wb3J0IFNldCBmcm9tICdzZXQnO1xuICAgICAgICAgICAgdHlwZSA9PT0gXCJJbXBvcnRTcGVjaWZpZXJcIiB8fCAvLyBleC4gaW1wb3J0IHtTZXR9IGZyb20gJ3NldCc7XG4gICAgICAgICAgICB0eXBlID09PSBcIkltcG9ydERlY2xhcmF0aW9uXCIgLy8gZXguIGltcG9ydCB7U2V0fSBmcm9tICdzZXQnO1xuICAgICAgICAgICkge1xuICAgICAgICAgICAgaWRlbnRpZmllcnMuYWRkKG5vZGUubmFtZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgXCJQcm9ncmFtOmV4aXRcIjogKCkgPT4ge1xuICAgICAgICAvLyBHZXQgYSBtYXAgb2YgYWxsIHRoZSB2YXJpYWJsZXMgZGVmaW5lZCBpbiB0aGUgcm9vdCBzY29wZSAobm90IHRoZSBnbG9iYWwgc2NvcGUpXG4gICAgICAgIC8vIGNvbnN0IHZhcmlhYmxlc01hcCA9IGNvbnRleHQuZ2V0U2NvcGUoKS5jaGlsZFNjb3Blcy5tYXAoZSA9PiBlLnNldClbMF07XG4gICAgICAgIGVycm9yc1xuICAgICAgICAgIC5maWx0ZXIoKGVycm9yKSA9PiAhaWRlbnRpZmllcnMuaGFzKGdldE5hbWUoZXJyb3Iubm9kZSkpKVxuICAgICAgICAgIC5mb3JFYWNoKChub2RlKSA9PiBjb250ZXh0LnJlcG9ydChub2RlKSk7XG4gICAgICB9LFxuICAgIH07XG4gIH0sXG59O1xuIl19
