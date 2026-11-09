/**
 * Unit tests of the framework-independent core: plain Jest and ts-jest,
 * without Angular or zone.js. The environment is Node, so nothing can lean
 * on browser globals by accident; a spec that needs them opts into jsdom
 * with a `@jest-environment jsdom` docblock.
 */
module.exports = {
  displayName: 'ui-watchtower',
  rootDir: __dirname,
  roots: ['<rootDir>/src', '<rootDir>/rxjs', '<rootDir>/rum'],
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }]
  },
  moduleNameMapper: {
    '^@absaoss-cps/ui-watchtower$': '<rootDir>/src/public-api.ts',
    '^@absaoss-cps/ui-watchtower/rxjs$': '<rootDir>/rxjs/src/public-api.ts',
    '^@absaoss-cps/ui-watchtower/rum$': '<rootDir>/rum/src/public-api.ts'
  },
  coverageDirectory: '<rootDir>/../../coverage/ui-watchtower',
  collectCoverageFrom: [
    '{src,rxjs,rum}/**/*.ts',
    '!**/*.spec.ts',
    '!**/public-api.ts'
  ]
};
