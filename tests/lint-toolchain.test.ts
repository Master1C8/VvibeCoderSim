import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { ESLint, Linter } = require('eslint');
const matcher = require('minimatch');

const verifyRule = (pluginName: string, ruleName: string, options: unknown[], source: string) => {
  const namespace = pluginName.replace('eslint-plugin-', '');
  const ruleId = `${namespace}/${ruleName}`;
  const messages = new Linter().verify(source, [{
    files: ['**/*.jsx'],
    plugins: { [namespace]: require(pluginName) },
    languageOptions: {
      parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
    },
    rules: { [ruleId]: ['error', ...options] },
  }], { filename: 'lint-compat-probe.jsx' });
  assert.ok(messages.every((message: { ruleId: string }) => message.ruleId === ruleId), JSON.stringify(messages));
  return messages;
};

test('installed lint consumers share the patched matcher with callable and named APIs', () => {
  for (const name of ['eslint', '@eslint/config-array', '@eslint/eslintrc',
    'eslint-plugin-react', 'eslint-plugin-import', 'eslint-plugin-jsx-a11y',
    '@typescript-eslint/typescript-estree']) {
    const consumer = createRequire(require.resolve(name));
    assert.equal(consumer('minimatch'), matcher, name);
  }
  assert.equal(matcher.minimatch, matcher);
  assert.equal(matcher('app/page.tsx', '**/*.tsx'), true);
  assert.equal(matcher.minimatch('app/page.tsx', '**/*.js'), false);
  const esm = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import matcher, { minimatch, Minimatch } from 'minimatch';
    if (matcher !== minimatch || !new Minimatch('**/*.tsx').match('app/page.tsx')) {
      throw new Error('ES module matcher API is incompatible');
    }
    process.stdout.write('matched');
  `], { cwd: process.cwd(), encoding: 'utf8', timeout: 5000 });
  assert.equal(esm, 'matched');
});

test('lint matcher preserves glob options, constructors, defaults and test helpers', () => {
  const cases: [string, string, object, boolean][] = [
    ['app/nested/page.tsx', '**/*.{ts,tsx}', {}, true],
    ['app/nested/page.js', '**/*.{ts,tsx}', {}, false],
    ['.next/page.tsx', '**/*.tsx', {}, false],
    ['.next/page.tsx', '**/*.tsx', { dot: true }, true],
    ['app/page.tsx', '*.tsx', { matchBase: true }, true],
    ['app/page.tsx', '*.tsx', {}, false],
    ['app/page.tsx', '!**/*.js', {}, true],
    ['app/page.js', '!**/*.js', {}, false],
    ['Widget_bad', 'Widget*', { noglobstar: true }, true],
    ['renderCard', 'render@(Card|Header)', {}, true],
    ['RenderCard', 'render*', { nocase: true }, true],
    ['#literal', '#*', {}, false],
    ['#literal', '#*', { nocomment: true }, true],
  ];
  for (const [path, pattern, options, expected] of cases) {
    assert.equal(matcher(path, pattern, options), expected, `${path}: ${pattern}`);
    assert.equal(new matcher.Minimatch(pattern, options).match(path), expected);
    assert.equal(matcher.makeRe(pattern, options).test(path), expected);
  }
  const withDots = matcher.defaults({ dot: true });
  assert.equal(withDots('.hidden.ts', '*.ts'), true);
  assert.equal(withDots('.hidden.ts', '*.ts', { dot: false }), false);
  assert.equal(new withDots.Minimatch('*.ts').match('.hidden.ts'), true);
  const CaseInsensitive = withDots.Minimatch.defaults({ nocase: true });
  assert.equal(new CaseInsensitive('*.TS').match('.hidden.ts'), true);
  assert.deepEqual(withDots.match(['.hidden.ts', 'visible.js'], '*.ts'), ['.hidden.ts']);
  assert.deepEqual(['.hidden.ts', 'visible.js'].filter(withDots.filter('*.ts')), ['.hidden.ts']);
});

test('actual project config keeps source selection, generated ignores and lint diagnostics', async () => {
  const eslint = new ESLint();
  assert.equal(await eslint.isPathIgnored('app/nested/probe.tsx'), false);
  assert.equal(await eslint.isPathIgnored('.next/generated/probe.tsx'), true);
  const [bad] = await eslint.lintText(`
    import { useState } from 'react';
    export default function Bad({ enabled }: { enabled: boolean }) {
      if (enabled) useState(0);
      return <><img src="/probe.png" />{[1].map(value => <span>{value}</span>)}</>;
    }
  `, { filePath: 'app/nested/probe.tsx' });
  const ids = bad.messages.map((message: { ruleId: string }) => message.ruleId);
  for (const rule of ['react-hooks/rules-of-hooks', 'react/jsx-key',
    'jsx-a11y/alt-text', '@next/next/no-img-element']) assert.ok(ids.includes(rule), rule);
  const [good] = await eslint.lintText(`
    import { useState } from 'react';
    export default function Good() {
      const [value] = useState(0);
      return <>{[value].map(item => <span key={item}>{item}</span>)}</>;
    }
  `, { filePath: 'app/nested/probe.tsx' });
  assert.deepEqual(good.messages, []);
});

test('React glob exceptions retain both accepting and rejecting rule paths', () => {
  const source = 'const App = () => <Widget_bad />;';
  assert.equal(verifyRule('eslint-plugin-react', 'jsx-pascal-case', [{ ignore: ['Widget*'] }], source).length, 0);
  assert.equal(verifyRule('eslint-plugin-react', 'jsx-pascal-case', [{ ignore: ['Other*'] }], source).length, 1);
});

test('import glob restrictions keep matching and nonmatching submodule checks', () => {
  const options = [{ forbid: ['blocked/**'] }];
  assert.equal(verifyRule('eslint-plugin-import', 'no-internal-modules', options,
    "import item from 'allowed/internal';").length, 0);
  assert.equal(verifyRule('eslint-plugin-import', 'no-internal-modules', options,
    "import item from 'blocked/internal';").length, 1);
});

test('accessibility glob controls still require label text and an associated control', () => {
  const options = [{ controlComponents: ['Input*'], assert: 'nesting' }];
  assert.equal(verifyRule('eslint-plugin-jsx-a11y', 'label-has-associated-control', options,
    'const App = () => <label>Name<InputField /></label>;').length, 0);
  const bad = verifyRule('eslint-plugin-jsx-a11y', 'label-has-associated-control', options,
    'const App = () => <label><InputField /></label>;');
  assert.equal(bad.length, 1);
  assert.match(bad[0].message, /accessible text/);
});

test('amplifying glob input completes within a bounded worker timeout', () => {
  const output = execFileSync(process.execPath, ['-e', `
    const matcher = require('minimatch');
    const pattern = '**/../'.repeat(100) + '*.tsx';
    matcher('app/page.tsx', pattern, { optimizationLevel: 2 });
    process.stdout.write('completed');
  `], { cwd: process.cwd(), encoding: 'utf8', timeout: 5000 });
  assert.equal(output, 'completed');
});
