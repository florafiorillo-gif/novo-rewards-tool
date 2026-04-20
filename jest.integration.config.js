const nextJest = require('next/jest.js')

const createJestConfig = nextJest({ dir: './' })

/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'node',
  setupFilesAfterEach: [],
  testMatch: ['<rootDir>/tests/integration/**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  // Integration tests hit a real Postgres, so don't mock Prisma.
  // Serial — integration tests share the DB; parallel would corrupt state.
  maxWorkers: 1,
  // Longer default; DB spin-up + truncate can add seconds.
  testTimeout: 30000,
}

module.exports = createJestConfig(config)
