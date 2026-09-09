import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactPlugin from 'eslint-plugin-react';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**'] },
  js.configs.recommended,
  {
    files: ['src/app/**/*.{ts,tsx}', 'src/main.tsx'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        ...globals.es2022,
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        afterEach: 'readonly',
        beforeEach: 'readonly',
        vi: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      react: reactPlugin,
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // Restore the plugin:react/recommended + jsx-runtime rule surface the
      // legacy .eslintrc enabled; dropping it would silently narrow lint.
      // eslint-plugin-react 7.x ships the recommended rule map in the
      // legacy shape; the rules themselves run fine under flat config.
      ...reactPlugin.configs.recommended.rules,
      // TypeScript itself guarantees defined names; no-undef only produces
      // false positives for ambient DOM/lib types used in type positions.
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
      'react/prop-types': 'off',
      // The new JSX transform makes these two meaningless.
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',
    },
  },
  prettier,
];
