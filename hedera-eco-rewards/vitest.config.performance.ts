import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    name: 'performance',
    include: ['tests/performance/**/*.performance.test.ts'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 300000, // 5 minutes for performance tests
    hookTimeout: 60000, // 1 minute for setup/teardown
    teardownTimeout: 60000,
    maxConcurrency: 1, // Run performance tests sequentially
    minThreads: 1,
    maxThreads: 1,
    environment: 'node',
    globals: true,
    setupFiles: ['tests/setup/test-setup.ts'],
    reporters: ['verbose', 'junit'],
    outputFile: {
      junit: './test-results/performance-results.xml'
    },
    // Performance-specific configuration
    benchmark: {
      include: ['tests/performance/**/*.bench.ts'],
      exclude: ['node_modules', 'dist'],
      reporters: ['verbose']
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@tests': resolve(__dirname, './tests')
    }
  }
})