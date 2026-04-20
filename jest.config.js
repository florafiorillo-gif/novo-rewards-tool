const nextJest = require('next/jest.js')

const createJestConfig = nextJest({ dir: './' })

/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: [
    '<rootDir>/tests/unit/**/*.test.ts',
    '<rootDir>/tests/unit/**/*.test.tsx',
    '<rootDir>/modules/**/*.test.ts',
    '<rootDir>/modules/**/*.test.tsx',
  ],
  // Integration tests live under tests/integration and are run via
  // jest.integration.config.js; keep them out of the unit suite.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/tests/integration/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  collectCoverageFrom: [
    'modules/**/*.{ts,tsx}',
    'lib/**/*.{ts,tsx}',
    '!**/*.d.ts',
  ],
}

module.exports = createJestConfig(config)
