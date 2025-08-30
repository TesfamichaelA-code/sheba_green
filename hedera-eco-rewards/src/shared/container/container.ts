import { Container } from 'inversify';
import 'reflect-metadata';
import { configureContainer, initializeServices } from './container-config';

/**
 * Dependency Injection Container
 *
 * This container manages all application dependencies using Inversify.
 * It follows the Dependency Inversion Principle by allowing high-level
 * modules to depend on abstractions rather than concrete implementations.
 */
export class DIContainer {
  private static instance: Container;
  private static initialized = false;

  /**
   * Get the singleton container instance
   */
  public static getInstance(): Container {
    if (!DIContainer.instance) {
      DIContainer.instance = new Container({
        defaultScope: 'Singleton',
        skipBaseClassChecks: true,
      });
    }
    return DIContainer.instance;
  }

  /**
   * Initialize the container with all bindings
   */
  public static async initialize(environment: string = process.env.NODE_ENV || 'development'): Promise<Container> {
    if (DIContainer.initialized) {
      return DIContainer.getInstance();
    }

    const container = DIContainer.getInstance();
    
    // Configure all bindings
    configureContainer(container, environment);
    
    // Initialize services
    await initializeServices(container);
    
    DIContainer.initialized = true;
    return container;
  }

  /**
   * Reset the container (useful for testing)
   */
  public static reset(): void {
    if (DIContainer.instance) {
      DIContainer.instance.unbindAll();
    }
    DIContainer.instance = new Container({
      defaultScope: 'Singleton',
      skipBaseClassChecks: true,
    });
    DIContainer.initialized = false;
  }
}

export const container = DIContainer.getInstance();
