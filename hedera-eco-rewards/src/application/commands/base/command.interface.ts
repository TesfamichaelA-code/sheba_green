/**
 * Base Command Interface
 * 
 * Defines the contract for all commands in the CQRS pattern.
 * Commands represent write operations that change system state.
 */

export interface Command {
  readonly commandId: string;
  readonly timestamp: Date;
  readonly userId?: string; // Optional user context for auditing
}

export interface CommandHandler<TCommand extends Command, TResult = void> {
  handle(command: TCommand): Promise<TResult>;
}

export interface CommandBus {
  execute<TCommand extends Command, TResult = void>(
    command: TCommand
  ): Promise<TResult>;
  register<TCommand extends Command, TResult = void>(
    commandType: string,
    handler: CommandHandler<TCommand, TResult>
  ): void;
}

export abstract class BaseCommand implements Command {
  public readonly commandId: string;
  public readonly timestamp: Date;

  constructor(public readonly userId?: string) {
    this.commandId = this.generateCommandId();
    this.timestamp = new Date();
  }

  private generateCommandId(): string {
    return `cmd-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}

export class CommandValidationError extends Error {
  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: any
  ) {
    super(message);
    this.name = 'CommandValidationError';
  }
}

export class CommandExecutionError extends Error {
  constructor(
    message: string,
    public readonly commandId: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'CommandExecutionError';
  }
}