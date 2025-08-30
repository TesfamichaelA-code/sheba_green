import { Server as HttpServer } from 'http';
import { Container } from 'inversify';
import { ExpressApp } from './app';
import { IConfigService } from '@shared/config/config.interface';
import { TYPES } from '@shared/container/types';

/**
 * HTTP Server Manager
 *
 * Handles server lifecycle including initialization, startup, and graceful shutdown.
 * Provides proper error handling and cleanup for production deployments.
 */
export class Server {
  private httpServer: HttpServer | null = null;
  private container: Container; // Used for dependency injection
  private configService: IConfigService;
  private expressApp: ExpressApp;
  private isShuttingDown = false;

  constructor(container: Container) {
    this.container = container;
    this.configService = container.get<IConfigService>(TYPES.ConfigService);
    this.expressApp = new ExpressApp(container);
  }

  /**
   * Start the HTTP server
   */
  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const config = this.configService.getConfig();
        const app = this.expressApp.getApp();

        // Create HTTP server
        this.httpServer = app.listen(config.api.port, config.api.host, () => {
          console.log(`🚀 Server started on ${config.api.host}:${config.api.port}`);
          console.log(`📊 Health checks available at:`);
          console.log(`   - Health: http://${config.api.host}:${config.api.port}/health`);
          console.log(`   - Ready: http://${config.api.host}:${config.api.port}/health/ready`);
          console.log(`   - Live: http://${config.api.host}:${config.api.port}/health/live`);
          console.log(`🌍 Environment: ${config.environment}`);
          resolve();
        });

        // Handle server errors
        this.httpServer.on('error', (error: Error) => {
          console.error('Server error:', error);
          reject(error);
        });

        // Handle client errors
        this.httpServer.on('clientError', (error: Error, socket: any) => {
          console.error('Client error:', error);
          if (socket.writable) {
            socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
          }
        });

        // Set server timeout
        this.httpServer.timeout = 30000; // 30 seconds
        this.httpServer.keepAliveTimeout = 5000; // 5 seconds
        this.httpServer.headersTimeout = 6000; // 6 seconds

      } catch (error) {
        console.error('Failed to start server:', error);
        reject(error);
      }
    });
  }

  /**
   * Stop the HTTP server gracefully
   */
  public async stop(): Promise<void> {
    if (this.isShuttingDown) {
      console.log('Server is already shutting down...');
      return;
    }

    this.isShuttingDown = true;
    console.log('🛑 Initiating graceful shutdown...');

    return new Promise((resolve) => {
      if (!this.httpServer) {
        console.log('Server was not running');
        resolve();
        return;
      }

      // Stop accepting new connections
      this.httpServer.close((error) => {
        if (error) {
          console.error('Error during server shutdown:', error);
        } else {
          console.log('✅ Server closed successfully');
        }
        resolve();
      });

      // Force close after timeout
      const forceCloseTimeout = setTimeout(() => {
        console.log('⚠️ Force closing server due to timeout');
        this.httpServer?.closeAllConnections?.();
        resolve();
      }, 10000); // 10 seconds timeout

      // Clear timeout if server closes normally
      this.httpServer.on('close', () => {
        clearTimeout(forceCloseTimeout);
      });
    });
  }

  /**
   * Get server information
   */
  public getServerInfo(): {
    isRunning: boolean;
    address: string | null;
    port: number | null;
  } {
    if (!this.httpServer || !this.httpServer.listening) {
      return {
        isRunning: false,
        address: null,
        port: null,
      };
    }

    const address = this.httpServer.address();
    if (typeof address === 'string') {
      return {
        isRunning: true,
        address,
        port: null,
      };
    }

    return {
      isRunning: true,
      address: address?.address || null,
      port: address?.port || null,
    };
  }

  /**
   * Setup graceful shutdown handlers
   */
  public setupGracefulShutdown(): void {
    // Handle SIGTERM (Docker, Kubernetes)
    process.on('SIGTERM', async () => {
      console.log('📨 SIGTERM received, starting graceful shutdown...');
      await this.gracefulShutdown();
    });

    // Handle SIGINT (Ctrl+C)
    process.on('SIGINT', async () => {
      console.log('📨 SIGINT received, starting graceful shutdown...');
      await this.gracefulShutdown();
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', async (error: Error) => {
      console.error('💥 Uncaught Exception:', error);
      await this.gracefulShutdown(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', async (reason: unknown, promise: Promise<any>) => {
      console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
      await this.gracefulShutdown(1);
    });
  }

  /**
   * Perform graceful shutdown
   */
  private async gracefulShutdown(exitCode: number = 0): Promise<void> {
    try {
      // Stop accepting new requests
      await this.stop();

      // Close database connections
      // TODO: Add database cleanup when implemented

      // Close Redis connections
      // TODO: Add Redis cleanup when implemented

      // Close other resources
      // TODO: Add other resource cleanup as needed

      console.log('✅ Graceful shutdown completed');
      process.exit(exitCode);
    } catch (error) {
      console.error('❌ Error during graceful shutdown:', error);
      process.exit(1);
    }
  }

  /**
   * Get the Express app instance
   */
  public getApp(): ExpressApp {
    return this.expressApp;
  }
}