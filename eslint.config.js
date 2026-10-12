import js from '@eslint/js';
import globals from 'globals';

// Same baseline as the site's functions code: catches undefined names,
// unused variables and unreachable code before the bot is restarted with them.
export default [
  { ignores: ['node_modules', 'transcripts', 'data'] },
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },
];
