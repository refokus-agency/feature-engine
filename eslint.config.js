import js from '@eslint/js';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import prettierConfig from 'eslint-config-prettier';
import nodePlugin from 'eslint-plugin-n';
// TODO: no debugger no production
export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '.env',
      'coverage/**',
      '.vscode/**',
      '*.config.js',
      '*.config.ts',
    ],
  },
  {
    // js rules
    ...js.configs.recommended,
    rules: {
      'no-console': 'off',
      semi: ['error', 'always'],
    },
  },
  {
    // node rules - disabled problematic import rules
    ...nodePlugin.configs['flat/recommended'],
  },
  {
    // typescript rules
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        project: './tsconfig.json',
        ecmaVersion: 2021,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
    },
    rules: {
      ...typescript.configs.recommended.rules,
      '@typescript-eslint/array-type': ['error', { default: 'array-simple' }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // prettier config - disable conflicting rules
    rules: {
      ...prettierConfig.rules,
    },
  },
];
