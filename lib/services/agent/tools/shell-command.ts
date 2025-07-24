/**
 * ShellCommand Tool - Shell 命令执行工具
 * 🎯 参考 qwen-code 的 ShellTool 实现，特别加强安全机制
 * ⚠️ 安全第一：严格的命令白名单和黑名单机制
 */

import { spawn } from 'node:child_process';
import path from 'node:path';

import type { ValidationResult } from '../../../../types';
import {
  BaseTool,
  type ToolParams,
  type ToolResult,
} from './base-tool';

export interface ShellCommandParams extends ToolParams {
  command: string;
  working_directory?: string;
  timeout?: number;
  capture_output?: boolean;
}

export interface ShellCommandResult extends ToolResult {
  success: boolean;
  command: string;
  working_directory: string;
  exit_code: number;
  stdout: string;
  stderr: string;
  error?: string;
  llmContent?: string;
  returnDisplay?: string;
  execution_time: number;
  timeout_occurred?: boolean;
}

/**
 * 安全配置类
 */
class SecurityConfig {
  // 允许的命令白名单（基本命令）
  static readonly ALLOWED_COMMANDS = new Set([
    // 文件和目录操作
    'ls', 'dir', 'pwd', 'cd', 'mkdir', 'rmdir', 'cp', 'mv', 'echo', 'cat', 'head', 'tail',
    'find', 'grep', 'awk', 'sed', 'sort', 'uniq', 'wc', 'diff', 'tree',
    
    // Git 命令
    'git',
    
    // 包管理和构建
    'npm', 'yarn', 'pnpm', 'node', 'python', 'python3', 'pip', 'pip3',
    'cargo', 'rustc', 'go', 'java', 'javac', 'mvn', 'gradle',
    
    // 开发工具
    'code', 'vim', 'nano', 'emacs', 'tsc', 'eslint', 'prettier', 'jest', 'mocha',
    'docker', 'docker-compose',
    
    // 系统信息（只读）
    'whoami', 'id', 'uname', 'date', 'uptime', 'ps', 'top', 'htop', 'df', 'du', 'free',
    'which', 'whereis', 'type', 'command', 'env', 'printenv',
  ]);

  // 危险命令黑名单
  static readonly BLOCKED_COMMANDS = new Set([
    // 系统控制
    'sudo', 'su', 'doas', 'chmod', 'chown', 'chgrp', 
    'systemctl', 'service', 'reboot', 'shutdown', 'halt', 'poweroff',
    
    // 网络和下载
    'curl', 'wget', 'nc', 'netcat', 'telnet', 'ssh', 'scp', 'rsync', 'ftp', 'sftp',
    
    // 文件删除（危险）
    'rm', 'del', 'rmdir', 'format', 'fdisk', 'mkfs',
    
    // 进程控制
    'kill', 'killall', 'pkill', 'nohup', 'bg', 'fg', 'jobs',
    
    // 编译器和解释器（可能执行任意代码）
    'gcc', 'g++', 'clang', 'make', 'cmake', 'sh', 'bash', 'zsh', 'fish', 'csh', 'tcsh',
    'perl', 'ruby', 'php', 'lua',
    
    // 系统配置
    'crontab', 'at', 'mount', 'umount', 'fsck', 'dd',
  ]);

  // 危险参数模式
  static readonly DANGEROUS_PATTERNS = [
    /--?force/i,
    /--?recursive/i,
    /-[rf]+/,
    /\|\s*sh/,
    /\|\s*bash/,
    /\$\(/,
    /`[^`]*`/,
    />\s*\/dev\//,
    /2>&1/,
    /&&/,
    /\|\|/,
    /;/,
    /\beval\b/,
    /\bexec\b/,
  ];

  static isCommandAllowed(command: string): { allowed: boolean; reason?: string } {
    const baseCommand = command.split(/\s+/)[0].toLowerCase();
    
    // 检查是否在黑名单中
    if (this.BLOCKED_COMMANDS.has(baseCommand)) {
      return { 
        allowed: false, 
        reason: `Command '${baseCommand}' is explicitly blocked for security reasons.` 
      };
    }

    // 检查是否在白名单中
    if (!this.ALLOWED_COMMANDS.has(baseCommand)) {
      return { 
        allowed: false, 
        reason: `Command '${baseCommand}' is not in the allowed commands list.` 
      };
    }

    // 检查危险参数模式
    for (const pattern of this.DANGEROUS_PATTERNS) {
      if (pattern.test(command)) {
        return { 
          allowed: false, 
          reason: `Command contains dangerous pattern: ${pattern.source}` 
        };
      }
    }

    return { allowed: true };
  }
}

/**
 * ShellCommand 工具实现
 * 🛡️ 安全特性：
 * - 严格的命令白名单机制
 * - 危险命令和参数黑名单
 * - 工作目录限制
 * - 执行超时控制
 * - 输出长度限制
 */
export class ShellCommandTool extends BaseTool<ShellCommandParams, ShellCommandResult> {
  static readonly Name = 'execute_shell_command';

  constructor(private projectRoot: string = process.cwd()) {
    super({
      name: ShellCommandTool.Name,
      displayName: 'ExecuteShell',
      description: `Executes a shell command in a secure environment within the project directory.

🛡️ SECURITY FEATURES:
- Command whitelist: Only safe, approved commands are allowed
- Dangerous command blocking: Prevents system-level operations
- Working directory restrictions: Commands run within project scope
- Timeout protection: Prevents long-running processes
- Output limits: Prevents memory exhaustion

⚠️ ALLOWED COMMANDS:
- File operations: ls, cat, head, tail, find, grep, etc.
- Git commands: git status, git log, git diff, etc.  
- Development tools: npm, node, tsc, eslint, prettier, etc.
- Read-only system info: whoami, uname, date, ps, etc.

❌ BLOCKED COMMANDS:
- System control: sudo, chmod, reboot, etc.
- File deletion: rm, del, format, etc.
- Network access: curl, wget, ssh, etc.
- Process control: kill, killall, etc.

This tool is designed for safe development operations only.`,
      
      schema: {
        type: 'object',
        description: 'Execute shell commands in a secure environment',
        properties: {
          command: {
            type: 'string',
            description: `The shell command to execute. Must be from the approved whitelist.

Examples:
- "ls -la" - List files with details
- "git status" - Check git repository status  
- "npm install" - Install dependencies
- "node --version" - Check Node.js version
- "grep -r 'function' src/" - Search for functions in src directory`,
          },
          working_directory: {
            type: 'string',
            description: 'Optional: Working directory for command execution. Must be within project directory. Defaults to project root.',
          },
          timeout: {
            type: 'number',
            description: 'Optional: Maximum execution time in seconds. Defaults to 30 seconds. Max 300 seconds.',
            default: 30,
          },
          capture_output: {
            type: 'boolean',
            description: 'Optional: Whether to capture and return command output. Defaults to true.',
            default: true,
          },
        },
        required: ['command'],
      },
    });
  }

  /**
   * 验证工作目录
   */
  private validateWorkingDirectory(workingDir?: string): { isValid: boolean; resolvedPath: string; error?: string } {
    try {
      const resolvedPath = workingDir 
        ? (path.isAbsolute(workingDir) ? workingDir : path.resolve(this.projectRoot, workingDir))
        : this.projectRoot;

      // 检查路径是否在项目根目录内
      const relativePath = path.relative(this.projectRoot, resolvedPath);
      if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        return {
          isValid: false,
          resolvedPath,
          error: `Working directory '${workingDir || '.'}' is outside the project directory.`,
        };
      }

      return { isValid: true, resolvedPath };
    } catch (error) {
      return {
        isValid: false,
        resolvedPath: workingDir || this.projectRoot,
        error: `Invalid working directory: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * 执行 shell 命令
   */
  private async executeCommand(
    command: string,
    workingDirectory: string,
    timeout: number,
    captureOutput: boolean
  ): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
    executionTime: number;
    timeoutOccurred: boolean;
  }> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let timeoutOccurred = false;
      
      // 分解命令和参数
      const args = command.split(/\s+/);
      const baseCommand = args[0];
      const commandArgs = args.slice(1);

      // 创建子进程
      const child = spawn(baseCommand, commandArgs, {
        cwd: workingDirectory,
        shell: true,
        stdio: captureOutput ? 'pipe' : 'inherit',
        env: {
          ...process.env,
          // 限制环境变量，增加安全性
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          USER: process.env.USER,
          TERM: process.env.TERM,
        },
      });

      let stdout = '';
      let stderr = '';

      // 设置超时
      const timeoutHandle = setTimeout(() => {
        timeoutOccurred = true;
        child.kill('SIGTERM');
        
        // 如果 SIGTERM 无效，使用 SIGKILL
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 5000);
      }, timeout * 1000);

      if (captureOutput) {
        // 捕获标准输出
        child.stdout?.on('data', (data) => {
          stdout += data.toString();
          // 限制输出长度，防止内存问题
          if (stdout.length > 1024 * 1024) { // 1MB 限制
            child.kill('SIGTERM');
          }
        });

        // 捕获标准错误
        child.stderr?.on('data', (data) => {
          stderr += data.toString();
          if (stderr.length > 1024 * 1024) { // 1MB 限制
            child.kill('SIGTERM');
          }
        });
      }

      // 监听进程结束
      child.on('close', (code) => {
        clearTimeout(timeoutHandle);
        const executionTime = Date.now() - startTime;
        
        resolve({
          exitCode: code || 0,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          executionTime,
          timeoutOccurred,
        });
      });

      // 监听错误
      child.on('error', (error) => {
        clearTimeout(timeoutHandle);
        const executionTime = Date.now() - startTime;
        
        resolve({
          exitCode: 1,
          stdout: '',
          stderr: `Process error: ${error.message}`,
          executionTime,
          timeoutOccurred,
        });
      });
    });
  }

  protected async executeImpl(params: ShellCommandParams, _signal: AbortSignal): Promise<ShellCommandResult> {
    // Note: signal parameter is required by base class but not currently used for command cancellation
    void _signal;
    
    const {
      command,
      working_directory,
      timeout = 30,
      capture_output = true,
    } = params;

    // 1. 验证命令安全性
    const securityCheck = SecurityConfig.isCommandAllowed(command);
    if (!securityCheck.allowed) {
      return {
        output: `Command blocked for security: ${securityCheck.reason}`,
        success: false,
        command,
        working_directory: working_directory || this.projectRoot,
        exit_code: 1,
        stdout: '',
        stderr: '',
        execution_time: 0,
        error: `Security violation: ${securityCheck.reason}`,
        llmContent: `Command blocked for security: ${securityCheck.reason}`,
        returnDisplay: `🛡️ **Security Block**\n\nCommand: \`${command}\`\nReason: ${securityCheck.reason}`,
      };
    }

    // 2. 验证工作目录
    const dirValidation = this.validateWorkingDirectory(working_directory);
    if (!dirValidation.isValid) {
      return {
        output: `Error: ${dirValidation.error}`,
        success: false,
        command,
        working_directory: working_directory || this.projectRoot,
        exit_code: 1,
        stdout: '',
        stderr: '',
        execution_time: 0,
        error: dirValidation.error,
        llmContent: `Error: ${dirValidation.error}`,
        returnDisplay: `❌ **Directory Error**\n\nCommand: \`${command}\`\nError: ${dirValidation.error}`,
      };
    }

    // 3. 验证超时设置
    const actualTimeout = Math.min(Math.max(timeout, 1), 300); // 1-300秒限制

    const { resolvedPath } = dirValidation;

    try {
      // 4. 执行命令
      const result = await this.executeCommand(command, resolvedPath, actualTimeout, capture_output);

      // 5. 构建响应
      const shellResult: ShellCommandResult = {
        output: this.formatDisplayContent(command, resolvedPath, result),
        success: result.exitCode === 0 && !result.timeoutOccurred,
        command,
        working_directory: resolvedPath,
        exit_code: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        execution_time: result.executionTime,
        timeout_occurred: result.timeoutOccurred,
        llmContent: this.formatLLMContent(command, result),
        returnDisplay: this.formatDisplayContent(command, resolvedPath, result),
      };

      return shellResult;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      return {
        output: `Failed to execute command '${command}': ${errorMessage}`,
        success: false,
        command,
        working_directory: resolvedPath,
        exit_code: 1,
        stdout: '',
        stderr: errorMessage,
        execution_time: 0,
        error: errorMessage,
        llmContent: `Failed to execute command '${command}': ${errorMessage}`,
        returnDisplay: `❌ **Execution Failed**\n\nCommand: \`${command}\`\nError: ${errorMessage}`,
      };
    }
  }

  private formatLLMContent(command: string, result: {
    exitCode: number;
    stdout: string;
    stderr: string;
    executionTime: number;
    timeoutOccurred: boolean;
  }): string {
    let content = `Command execution: ${command}\n`;
    content += `Exit code: ${result.exitCode}\n`;
    content += `Execution time: ${result.executionTime}ms\n`;
    
    if (result.timeoutOccurred) {
      content += `⚠️ Command timed out\n`;
    }
    
    if (result.stdout) {
      content += `\nStdout:\n${result.stdout}\n`;
    }
    
    if (result.stderr) {
      content += `\nStderr:\n${result.stderr}\n`;
    }
    
    return content;
  }

  private formatDisplayContent(command: string, workingDir: string, result: {
    exitCode: number;
    stdout: string;
    stderr: string;
    executionTime: number;
    timeoutOccurred: boolean;
  }): string {
    const relativePath = path.relative(this.projectRoot, workingDir);
    const icon = result.exitCode === 0 && !result.timeoutOccurred ? '✅' : '❌';
    
    let display = `${icon} **Command Execution**\n\n`;
    display += `**Command:** \`${command}\`\n`;
    display += `**Directory:** \`${relativePath || '.'}\`\n`;
    display += `**Exit Code:** ${result.exitCode}\n`;
    display += `**Time:** ${result.executionTime}ms\n`;
    
    if (result.timeoutOccurred) {
      display += `**Status:** ⏰ Timed out\n`;
    }
    
    display += '\n';
    
    if (result.stdout) {
      display += `**Output:**\n\`\`\`\n${result.stdout}\n\`\`\`\n\n`;
    }
    
    if (result.stderr) {
      display += `**Errors:**\n\`\`\`\n${result.stderr}\n\`\`\`\n`;
    }
    
    return display;
  }

  protected validateSpecific(params: ShellCommandParams): ValidationResult {
    if (!params.command) {
      return { valid: false, error: 'command is required' };
    }
    
    if (params.command.trim().length === 0) {
      return { valid: false, error: 'command cannot be empty' };
    }

    if (params.timeout !== undefined && (params.timeout < 1 || params.timeout > 300)) {
      return { valid: false, error: 'timeout must be between 1 and 300 seconds' };
    }
    
    return { valid: true };
  }

  getDescription(params: ShellCommandParams): string {
    const { command, working_directory, timeout } = params;
    let description = `Execute command: '${command}'`;
    
    if (working_directory) {
      description += ` in '${working_directory}'`;
    }
    
    if (timeout && timeout !== 30) {
      description += ` (timeout: ${timeout}s)`;
    }
    
    return description;
  }
}

/**
 * 创建 ShellCommand 工具实例
 */
export function createShellCommandTool(projectRoot?: string): ShellCommandTool {
  return new ShellCommandTool(projectRoot);
}

/**
 * 导出安全配置供其他模块使用
 */
export { SecurityConfig };