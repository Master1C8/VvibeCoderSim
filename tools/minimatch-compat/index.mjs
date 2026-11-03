import matcher from './index.cjs';

export default matcher;
export const {
  minimatch, Minimatch, makeRe, defaults, filter, match, braceExpand,
  escape, unescape, sep, GLOBSTAR,
} = matcher;
