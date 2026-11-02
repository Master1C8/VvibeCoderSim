# Lint matcher compatibility

The lint dependency tree still requests minimatch 3 and 10, both covered by
GHSA-g3hv-75wg-m249. This private local package routes those requests to audited
upstream minimatch 11.0.4 through the `minimatch-modern` npm alias. It contains no
legacy matching engine and is not published.

The root dev dependency and `$minimatch` override keep npm's local file reference
anchored at the project root. Preserve both when updating the lockfile.

The adapter retains the callable CommonJS export, named matcher properties,
constructor, defaults and helper methods used by the current lint packages.
`makeRe()` supplies the `.test(path)` interface used by
`import/no-internal-modules`; it deliberately does not return a `RegExp`.
Every match delegates to minimatch 11's nonrecursive engine.

`tests/lint-toolchain.test.ts` checks representative glob semantics, lint file
selection, and positive/negative rule cases for the affected plugins. Keep these
checks when updating the toolchain. Remove this adapter, the root dependency and
the override once every lint dependency supports a patched upstream matcher
directly. If another dependency starts relying on additional legacy APIs,
implement and test that use explicitly rather than returning a permissive match.

The Docker dependency stage copies this directory before `npm ci` because it is
part of the reproducible development dependency tree. Production application
code and lint rule configuration are unchanged.
