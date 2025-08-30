/**
 * Command Bus Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InMemoryCommandBus } from './command-bus';
import { BaseCommand, CommandHandler, CommandExecutionError } from './base/command.interface';

// Test command
class TestCommand extends BaseCommand {
  constructor(public readonly data: string, userId?: string) {
    super(userId);
  }
}

// Test handler
class TestCommandHandler implements CommandHandler<TestCommand, string> {
  async handle(command: TestCommand): Promise<string> {
    return `Handled: ${command.data}`;
  }
}

// Failing handler
class FailingCommandHandler implements CommandHandler<TestCommand, string> {
  async handle(command: TestCommand): Promise<string> {
    throw new Error('Handler failed');
  }
}

describe('InMemoryCommandBus', () => {
  let commandBus: InMemoryCommandBus;

  beforeEach(() => {
    commandBus = new InMemoryCommandBus();
  });

  describe('register', () => {
    it('should register command handler successfully', () => {
      const handler = new TestCommandHandler();
      
      expect(() => {
        commandBus.register('TestCommand', handler);
      }).not.toThrow();
      
      expect(commandBus.getRegisteredCommands()).toContain('TestCommand');
    });

    it('should throw error when registering duplicate handler', () => {
      const handler1 = new TestCommandHandler();
      const handler2 = new TestCommandHandler();
      
      commandBus.register('TestCommand', handler1);
      
      expect(() => {
        commandBus.register('TestCommand', handler2);
      }).toThrow('Command handler for TestCommand is already registered');
    });
  });

  describe('execute', () => {
    it('should execute command successfully', async () => {
      const handler = new TestCommandHandler();
      const command = new TestCommand('test data');
      
      commandBus.register('TestCommand', handler);
      
      const result = await commandBus.execute(command);
      
      expect(result).toBe('Handled: test data');
    });

    it('should throw error for unregistered command', async () => {
      const command = new TestCommand('test data');
      
      await expect(commandBus.execute(command)).rejects.toThrow(CommandExecutionError);
      await expect(commandBus.execute(command)).rejects.toThrow(
        'No handler registered for command type: TestCommand'
      );
    });

    it('should wrap handler errors in CommandExecutionError', async () => {
      const handler = new FailingCommandHandler();
      const command = new TestCommand('test data');
      
      commandBus.register('TestCommand', handler);
      
      await expect(commandBus.execute(command)).rejects.toThrow(CommandExecutionError);
      await expect(commandBus.execute(command)).rejects.toThrow(
        'Command execution failed: Handler failed'
      );
    });

    it('should log command execution', async () => {
      const handler = new TestCommandHandler();
      const command = new TestCommand('test data');
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      commandBus.register('TestCommand', handler);
      
      await commandBus.execute(command);
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Executing command: TestCommand')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Command executed successfully: TestCommand')
      );
      
      consoleLogSpy.mockRestore();
    });

    it('should log command execution errors', async () => {
      const handler = new FailingCommandHandler();
      const command = new TestCommand('test data');
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      commandBus.register('TestCommand', handler);
      
      await expect(commandBus.execute(command)).rejects.toThrow();
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Command execution failed: TestCommand'),
        expect.any(Error)
      );
      
      consoleErrorSpy.mockRestore();
    });
  });

  describe('unregister', () => {
    it('should unregister command handler successfully', () => {
      const handler = new TestCommandHandler();
      
      commandBus.register('TestCommand', handler);
      expect(commandBus.getRegisteredCommands()).toContain('TestCommand');
      
      const result = commandBus.unregister('TestCommand');
      
      expect(result).toBe(true);
      expect(commandBus.getRegisteredCommands()).not.toContain('TestCommand');
    });

    it('should return false when unregistering non-existent handler', () => {
      const result = commandBus.unregister('NonExistentCommand');
      expect(result).toBe(false);
    });
  });

  describe('getRegisteredCommands', () => {
    it('should return empty array when no commands registered', () => {
      expect(commandBus.getRegisteredCommands()).toEqual([]);
    });

    it('should return list of registered commands', () => {
      const handler1 = new TestCommandHandler();
      const handler2 = new TestCommandHandler();
      
      commandBus.register('TestCommand1', handler1);
      commandBus.register('TestCommand2', handler2);
      
      const commands = commandBus.getRegisteredCommands();
      expect(commands).toContain('TestCommand1');
      expect(commands).toContain('TestCommand2');
      expect(commands).toHaveLength(2);
    });
  });
});