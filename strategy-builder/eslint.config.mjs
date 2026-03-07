// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  // Global ignores — directories ESLint should never enter
  {
    ignores: [
      'node_modules/',
      '**/node_modules/',
      'dist/',
      '**/dist/',
      '../deployment-strategies/',
      'coverage/',
      '**/coverage/',
      'templates/'
    ]
  },

  // Base JS recommended rules
  eslint.configs.recommended,

  // TypeScript strict rules (applied to TS files only)
  ...tseslint.configs.strict,

  // Disable rules that conflict with Prettier
  prettierConfig,

  // Project-specific rule overrides
  {
    rules: {
      // Enforce no `any` — use `unknown` instead
      '@typescript-eslint/no-explicit-any': 'error',

      // Consistent type-only imports
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' }
      ],

      // No unused variables, but allow _ prefix for intentionally unused
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],

      // Warn on console usage (should use structured logging in production code)
      'no-console': 'warn'
    }
  }
);
