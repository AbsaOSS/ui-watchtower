module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'standard',
    'prettier'
  ],
  plugins: ['@typescript-eslint', 'prettier'],
  rules: {
    'prettier/prettier': ['error'],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }
    ],
    '@typescript-eslint/no-unused-expressions': [
      'error',
      {
        allowShortCircuit: true,
        allowTernary: true,
        allowTaggedTemplates: true
      }
    ]
  },
  env: {
    browser: true,
    jest: true
  },
  overrides: [
    {
      files: ['playwright/**/*.ts', 'playwright.config.ts'],
      env: {
        jest: false,
        node: true
      }
    },
    {
      // The core is framework-independent, and its main entry point loads
      // no optional peer: those get entry points of their own.
      files: ['projects/ui-watchtower/src/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: [
                  '@angular/*',
                  'zone.js',
                  '@absaoss-cps/ngx-ui-watchtower',
                  '@absaoss-cps/ngx-ui-watchtower/*'
                ],
                message: 'The core is framework-independent.'
              },
              {
                group: ['rxjs', 'rxjs/*', 'aws-rum-web', 'aws-rum-web/*'],
                message:
                  'The main entry point loads no optional peer; use an entry point of its own.'
              }
            ]
          }
        ]
      }
    }
  ]
};
