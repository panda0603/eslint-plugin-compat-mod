'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true,
});
exports.nodes = void 0;

var _caniuseProvider = _interopRequireDefault(require('./caniuse-provider'));

var _mdnProvider = _interopRequireDefault(require('./mdn-provider'));

function _interopRequireDefault(obj) {
  return obj && obj.__esModule ? obj : { default: obj };
}

/*
 * Step 3) Compat use CanIUse and MDN providers to check if a target browser supports a particular API
 */
// eslint-disable-next-line import/prefer-default-export
const nodes = [..._caniuseProvider.default, ..._mdnProvider.default];
exports.nodes = nodes;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9wcm92aWRlcnMvaW5kZXgudHMiXSwibmFtZXMiOlsibm9kZXMiLCJjYW5JVXNlTm9kZXMiLCJtZG5Ob2RlcyJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUdBOztBQUNBOzs7O0FBSkE7OztBQU9BO0FBQ08sTUFBTUEsS0FBK0MsR0FBRyxDQUM3RCxHQUFHQyx3QkFEMEQsRUFFN0QsR0FBR0Msb0JBRjBELENBQXhEIiwic291cmNlc0NvbnRlbnQiOlsiLypcbiAqIFN0ZXAgMykgQ29tcGF0IHVzZSBDYW5JVXNlIGFuZCBNRE4gcHJvdmlkZXJzIHRvIGNoZWNrIGlmIGEgdGFyZ2V0IGJyb3dzZXIgc3VwcG9ydHMgYSBwYXJ0aWN1bGFyIEFQSVxuICovXG5pbXBvcnQgY2FuSVVzZU5vZGVzIGZyb20gXCIuL2Nhbml1c2UtcHJvdmlkZXJcIjtcbmltcG9ydCBtZG5Ob2RlcyBmcm9tIFwiLi9tZG4tcHJvdmlkZXJcIjtcbmltcG9ydCB0eXBlIHsgQXN0TWV0YWRhdGFBcGlXaXRoVGFyZ2V0c1Jlc29sdmVyIH0gZnJvbSBcIi4uL3R5cGVzXCI7XG5cbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBpbXBvcnQvcHJlZmVyLWRlZmF1bHQtZXhwb3J0XG5leHBvcnQgY29uc3Qgbm9kZXM6IEFycmF5PEFzdE1ldGFkYXRhQXBpV2l0aFRhcmdldHNSZXNvbHZlcj4gPSBbXG4gIC4uLmNhbklVc2VOb2RlcyxcbiAgLi4ubWRuTm9kZXMsXG5dO1xuIl19
