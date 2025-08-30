/**
 * Command Bus Implementation
 * 
 * Handles command routing and execution with proper error handling and validation.
 */

import { Command, CommandHandler, CommandBus, CommandExecutionError } from './base/command.interface';

export class InMemoryCommandBus implements CommandBus {
  private handlers = new Map<string, CommandHandler<any, any>>();

  register<TCommand extends Command, TResult = void>(
    commandType: string,
    handler: CommandHandler<TCommand, TResult>
  ): void {
    if (this.handlers.has(commandType)) {
      throw new Error(`Command handler for ${commandType} is already registered`);
    }
    this.handlers.set(commandType, handler);
  }

  async execute<TCommand extends Command, TResult = void>(
    command: TCommand
  ): Promise<TResult> {
    const commandType = command.constructor.name;
    const handler = this.handlers.get(commandType);

    if (!handler) {
      throw new CommandExecutionError(
        `No handler registered for command type: ${commandType}`,
        command.commandId
      );
    }

    try {
      console.log(`Executing command: ${commandType} (ID: ${command.commandId})`);
      const startTime = Date.now();
      
      const result = await handler.handle(command);
      
      const executionTime = Date.now() - startTime;
      console.log(`Command executed successfully: ${commandType} (${executionTime}ms)`);
      
      return result;
    } catch (error) {
      console.error(`Command execution failed: ${commandType}`, error);
      
      if (error instanceof CommandExecutionError) {
        throw error;
      }
      
      throw new CommandExecutionError(
        `Command execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        command.commandId,
        error instanceof Error ? error : undefined
      );
    }
  }

  getRegisteredCommands(): string[] {
    return Array.from(this.handlers.keys());
  }

  unregister(commandType: string): boolean {
    return this.handlers.delete(commandType);
  }
}