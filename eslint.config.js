// Flat ESLint config for the workspace.
// Enforces a few CLAUDE.md conventions in addition to typescript-eslint recommendations:
//   - No default exports (named exports only).
//   - No console.* (logging goes through logging.ts -> stderr).
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'],
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
  }
);
