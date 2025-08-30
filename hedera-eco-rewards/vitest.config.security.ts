import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    name: 'security',
    include: ['tests/security/**/*.security.test.ts'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 120000, // 2 minutes for security tests
    hookTimeout: 30000, // 30 seconds for setup/teardown
    teardownTimeout: 30000,
    maxConcurrency: 2, // Limited concurrency for security tests
    environment: 'node',
    globals: true,
    setupFiles: ['tests/setup/test-setup.ts'],
    reporters: ['verbose', 'junit'],
    outputFile: {
      junit: './test-results/security-results.xml'
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@tests': resolve(__dirname, './tests')
    }
  }
})