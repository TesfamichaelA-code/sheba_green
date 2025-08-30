import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    name: 'contract',
    include: ['tests/contract/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 30000, // 30 seconds for contract tests
    hookTimeout: 15000, // 15 seconds for setup/teardown
    teardownTimeout: 15000,
    maxConcurrency: 4, // Higher concurrency for contract tests
    environment: 'node',
    globals: true,
    setupFiles: ['tests/setup/test-setup.ts'],
    reporters: ['verbose', 'junit'],
    outputFile: {
      junit: './test-results/contract-results.xml'
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@tests': resolve(__dirname, './tests')
    }
  }
})