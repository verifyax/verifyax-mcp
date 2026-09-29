// Flat ESLint config for the workspace.
// Enforces a few CLAUDE.md conventions in addition to typescript-eslint recommendations:
//   - No default exports (named exports only).
//   - No console.* (logging goes through logging.ts -> stderr).
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // types.gen.ts is generated from the OpenAPI spec (see scripts/sync-sdk-spec.sh).
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', '**/types.gen.ts'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-console': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportDefaultDeclaration',
          message: 'No default exports — use named exports only (see CLAUDE.md).',
        },
      ],
    },
  },
  {
    // Config files and tests may use console / default exports where the ecosystem expects them.
    files: ['**/*.config.{js,ts}', '**/test/**/*.ts'],
    rules: {
      'no-console': 'off',
      'no-restricted-syntax': 'off',
    },
  },
  {
    // Build/tooling scripts run under Node and may log to the console.
    // `fetch` is a Node global from 18 onward and this package requires >=20;
    // the list is an allowlist, so it has to be named or scripts that call the
    // advisory API fail no-undef.
    files: ['**/scripts/**/*.{js,mjs}'],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly', fetch: 'readonly' },
    },
    rules: {
      'no-console': 'off',
    },
  }
);
