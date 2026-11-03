const modern = require('minimatch-modern');

// Older lint plugins expect a callable CommonJS export. All matching still
// runs through the patched upstream implementation, including named imports.
function withDefaults(defaultOptions = {}) {
  const options = value => ({ ...defaultOptions, ...value });
  const minimatch = (path, pattern, value) => modern.minimatch(path, pattern, options(value));

  class Minimatch extends modern.Minimatch {
    constructor(pattern, value) {
      super(pattern, options(value));
    }

    // eslint-plugin-import's no-internal-modules rule only uses .test().
    // Do not compile a backtracking RegExp or bring the old matcher back.
    makeRe() {
      return { test: path => this.match(path) };
    }

    static defaults(value) {
      return withDefaults(options(value)).Minimatch;
    }
  }

  Object.assign(minimatch, modern, {
    minimatch,
    Minimatch,
    defaults: value => withDefaults(options(value)),
    makeRe: (pattern, value) => new Minimatch(pattern, value).makeRe(),
    filter: (pattern, value) => path => minimatch(path, pattern, value),
    match: (paths, pattern, value) => modern.match(paths, pattern, options(value)),
    braceExpand: (pattern, value) => modern.braceExpand(pattern, options(value)),
    escape: (path, value) => modern.escape(path, options(value)),
    unescape: (path, value) => modern.unescape(path, options(value)),
  });

  return minimatch;
}

module.exports = withDefaults();
