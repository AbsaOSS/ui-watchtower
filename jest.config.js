module.exports = {
  roots: ['<rootDir>/projects'],
  coverageDirectory: '<rootDir>/coverage',
  preset: 'jest-preset-angular',
  moduleNameMapper: {
    '^lodash-es$': 'lodash',
    '^@absaoss-cps/ngx-ui-watchtower$':
      '<rootDir>/projects/ngx-ui-watchtower/src/public-api.ts',
    '^@absaoss-cps/ngx-ui-watchtower/rum$':
      '<rootDir>/projects/ngx-ui-watchtower/rum/src/public-api.ts',
    '^@absaoss-cps/ngx-ui-watchtower/diagnostics$':
      '<rootDir>/projects/ngx-ui-watchtower/diagnostics/src/public-api.ts'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(.*.mjs$|@angular/common/locales/.*.js$))'
  ],
  transform: {
    '^.+.(ts|js|mjs|html|svg)$': [
      'jest-preset-angular',
      {
        diagnostics: false,
        stringifyContentPathRegex: '.(html|svg)$'
      }
    ]
  },
  testEnvironment: 'jest-environment-jsdom',
  setupFiles: ['zone.js'],
  setupFilesAfterEnv: ['<rootDir>/jest-setup.ts'],
  coverageReporters: ['text', 'html', 'lcov', 'json-summary'],
  collectCoverageFrom: [
    'projects/ngx-ui-watchtower/**/*.ts',
    '!projects/**/*.spec.ts',
    '!projects/**/public-api.ts'
  ]
};
