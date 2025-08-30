import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    name: 'integration',
    root: '.',
    environment: 'node',
    testTimeout: 120000, // 2 minutes for integration tests
    hookTimeout: 60000,  // 1 minute for setup/teardown
    teardownTimeout: 30000,
    
    // Test file patterns
    include: [
      'tests/integration/**/*.test.ts',
      'tests/integration/**/*.spec.ts'
    ],
    
    exclude: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      '**/*.d.ts'
    ],

    // Global setup and teardown
    globalSetup: ['tests/setup/global-setup.ts'],
    setupFiles: ['tests/setup/test-setup.ts'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: 'coverage/integration',
      exclude: [
        'coverage/**',
        'dist/**',
        'node_modules/**',
        'tests/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/vitest.config.*'
      ],
      thresholds: {
        global: {
          branches: 70,
          functions: 70,
          lines: 70,
          statements: 70
        }
      }
    },

    // Reporters
    reporters: [
      'default',
      'json',
      'html',
      'junit'
    ],

    outputFile: {
      json: 'test-reports/integration-results.json',
      html: 'test-reports/integration-results.html',
      junit: 'test-reports/integration-results.xml'
    },

    // Retry configuration
    retry: 2,
    
    // Pool configuration for parallel execution
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        maxThreads: 4,
        minThreads: 1
      }
    },

    // Sequence configuration
    sequence: {
      concurrent: true,
      shuffle: false,
      hooks: 'parallel'
    },

    // Watch mode (disabled for CI)
    watch: false,

    // Environment variables
    env: {
      NODE_ENV: 'integration',
      LOG_LEVEL: 'error',
      VITEST: 'true'
    }
  },

  // Resolve configuration
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@tests': path.resolve(__dirname, './tests')
    }
  },

  // Define configuration
  define: {
    'process.env.NODE_ENV': '"integration"'
  }
});