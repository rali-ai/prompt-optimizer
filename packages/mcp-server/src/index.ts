#!/usr/bin/env node

/*
 * Prompt Optimizer - AI prompt optimization toolkit
 * Copyright (C) 2025 linshenkx
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, version 3 of the License.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * MCP Server for Prompt Optimizer
 *
 * Provides 3 core tools:
 * - optimize-user-prompt: optimize user prompts
 * - optimize-system-prompt: optimize system prompts
 * - iterate-prompt: iterate on existing prompts
 *
 * Supports both stdio and HTTP transports
 *
 * Note: environment variables are loaded by environment.ts during startup
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { CoreServicesManager } from './adapters/core-services.js';
import { loadConfig, type MCPServerConfig } from './config/environment.js';
import * as logger from './utils/logging.js';
import { ParameterValidator } from './adapters/parameter-adapter.js';
import { getTemplateOptions, getDefaultTemplateId } from './config/templates.js';
import { createMcpHttpApp } from './http-app.js';

// 创建服务器实例的工厂函数
async function createServerInstance(config: MCPServerConfig) {
  // 创建 MCP Server 实例 - 使用正确的 API
  const server = new Server({
    name: 'prompt-optimizer-mcp-server',
    version: '0.1.0'
  }, {
    capabilities: {
      tools: {}
    }
  });

  // 初始化 Core 服务（每个服务器实例独立）
  const coreServices = CoreServicesManager.getInstance();
  await coreServices.initialize(config);

  return { server, coreServices };
}

// 设置服务器工具和处理器的函数
async function setupServerHandlers(server: Server, coreServices: CoreServicesManager) {

  // 获取模板选项和默认模板ID用于工具定义
  logger.info('Loading template options...');
  const templateManager = coreServices.getTemplateManager();
  const [userOptimizeOptions, systemOptimizeOptions, iterateOptions, userDefaultId, systemDefaultId, iterateDefaultId] = await Promise.all([
    getTemplateOptions(templateManager, 'userOptimize'),
    getTemplateOptions(templateManager, 'optimize'),
    getTemplateOptions(templateManager, 'iterate'),
    getDefaultTemplateId(templateManager, 'user'),
    getDefaultTemplateId(templateManager, 'system'),
    getDefaultTemplateId(templateManager, 'iterate')
  ]);

  // 注册工具列表处理器
  logger.info('Registering MCP tools...');
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "optimize-user-prompt",
          description: "Optimize a user prompt to improve clarity, specificity, and overall response quality. Best for everyday chat, Q&A, writing, and task-oriented requests.\n\nKey capabilities:\n- Make the request clearer and more specific\n- Add missing context when useful\n- Improve wording and logical structure\n- Help the model understand the goal more accurately\n\nTypical use cases:\n- Turn a vague question into a concrete request\n- Add detailed constraints to a creative task\n- Improve the framing of a technical question",
          inputSchema: {
            type: "object",
            properties: {
              prompt: {
                type: "string",
                description: "The user prompt to optimize. For example: 'Help me write an article' or 'Explain machine learning'."
              },
              template: {
                type: "string",
                description: `Choose an optimization template. Different templates fit different scenarios:\n${userOptimizeOptions.map(opt => `- ${opt.label}: ${opt.description}`).join('\n')}`,
                enum: userOptimizeOptions.map(opt => opt.value),
                default: userDefaultId
              }
            },
            required: ["prompt"]
          }
        },
        {
          name: "optimize-system-prompt",
          description: "Optimize a system prompt to improve role definition, instruction quality, and behavior control. Best for custom assistants, expert roles, and structured dialogue systems.\n\nKey capabilities:\n- Strengthen role definition and professionalism\n- Improve behavioral guidance and constraints\n- Refine instruction structure and hierarchy\n- Add missing domain context when needed\n\nTypical use cases:\n- Turn a simple role description into a professional system prompt\n- Add clearer operating rules for an AI assistant\n- Improve a domain-specific expert prompt",
          inputSchema: {
            type: "object",
            properties: {
              prompt: {
                type: "string",
                description: "The system prompt to optimize. For example: 'You are a helpful assistant' or 'You are a medical advisor'."
              },
              template: {
                type: "string",
                description: `Choose an optimization template. Different templates fit different scenarios:\n${systemOptimizeOptions.map(opt => `- ${opt.label}: ${opt.description}`).join('\n')}`,
                enum: systemOptimizeOptions.map(opt => opt.value),
                default: systemDefaultId
              }
            },
            required: ["prompt"]
          }
        },
        {
          name: "iterate-prompt",
          description: "Iteratively improve an existing prompt based on concrete requirements. Best when you already have a usable prompt but need targeted refinements.\n\nKey capabilities:\n- Preserve the prompt's core intent\n- Improve it against specific requirements\n- Address known weaknesses or output issues\n- Adapt it to new scenarios or constraints\n\nTypical use cases:\n- Improve a prompt that is close but not good enough\n- Adapt a prompt to new business or product needs\n- Fix output formatting or content issues\n- Strengthen a specific aspect of performance",
          inputSchema: {
            type: "object",
            properties: {
              prompt: {
                type: "string",
                description: "The existing prompt to refine. This should be a complete prompt that is already in use but needs improvement."
              },
              requirements: {
                type: "string",
                description: "The concrete improvement requirements or problem statement. For example: 'The output format is inconsistent', 'Use a more professional tone', or 'Increase creativity'."
              },
              template: {
                type: "string",
                description: `Choose an iteration template. Different templates use different refinement strategies:\n${iterateOptions.map(opt => `- ${opt.label}: ${opt.description}`).join('\n')}`,
                enum: iterateOptions.map(opt => opt.value),
                default: iterateDefaultId
              }
            },
            required: ["prompt", "requirements"]
          }
        }
      ]
    };
  });

  // 注册工具调用处理器
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    logger.info(`Handling tool call request: ${name}`);

    try {
      switch (name) {
        case "optimize-user-prompt": {
          const { prompt, template } = args as { prompt?: string; template?: string };

          if (!prompt) {
            return {
              isError: true,
              content: [{
                type: "text",
                text: "Error: Missing required parameter 'prompt'"
              }]
            };
          }

          // 参数验证
          ParameterValidator.validatePrompt(prompt);
          if (template) {
            ParameterValidator.validateTemplate(template);
          }

          // 调用 Core 服务
          const promptService = coreServices.getPromptService();
          const modelManager = coreServices.getModelManager();
          const templateManager = coreServices.getTemplateManager();

          // 检查 MCP 默认模型是否可用
          const mcpModel = await modelManager.getModel('mcp-default');
          if (!mcpModel || !mcpModel.enabled) {
            return {
              isError: true,
              content: [{
                type: "text",
                text: "Error: The MCP default model is not configured or not enabled. Check the environment configuration."
              }]
            };
          }

          const templateId = template || await getDefaultTemplateId(templateManager, 'user');
          const result = await promptService.optimizePrompt({
            targetPrompt: prompt,
            modelKey: 'mcp-default',
            optimizationMode: 'user',
            templateId
          });

          return {
            content: [{
              type: "text",
              text: result
            }]
          };
        }

        case "optimize-system-prompt": {
          const { prompt, template } = args as { prompt?: string; template?: string };

          if (!prompt) {
            return {
              isError: true,
              content: [{
                type: "text",
                text: "Error: Missing required parameter 'prompt'"
              }]
            };
          }

          // 参数验证
          ParameterValidator.validatePrompt(prompt);
          if (template) {
            ParameterValidator.validateTemplate(template);
          }

          // 调用 Core 服务
          const promptService = coreServices.getPromptService();
          const modelManager = coreServices.getModelManager();
          const templateManager = coreServices.getTemplateManager();

          // 检查 MCP 默认模型是否可用
          const mcpModel = await modelManager.getModel('mcp-default');
          if (!mcpModel || !mcpModel.enabled) {
            return {
              isError: true,
              content: [{
                type: "text",
                text: "Error: The MCP default model is not configured or not enabled. Check the environment configuration."
              }]
            };
          }

          const templateId = template || await getDefaultTemplateId(templateManager, 'system');
          const result = await promptService.optimizePrompt({
            targetPrompt: prompt,
            modelKey: 'mcp-default',
            optimizationMode: 'system',
            templateId
          });

          return {
            content: [{
              type: "text",
              text: result
            }]
          };
        }

        case "iterate-prompt": {
          const { prompt, requirements, template } = args as {
            prompt?: string;
            requirements?: string;
            template?: string
          };

          if (!prompt) {
            return {
              isError: true,
              content: [{
                type: "text",
                text: "Error: Missing required parameter 'prompt'"
              }]
            };
          }

          if (!requirements) {
            return {
              isError: true,
              content: [{
                type: "text",
                text: "Error: Missing required parameter 'requirements'"
              }]
            };
          }

          // 参数验证
          ParameterValidator.validatePrompt(prompt);
          ParameterValidator.validateRequirements(requirements);
          if (template) {
            ParameterValidator.validateTemplate(template);
          }

          // 调用 Core 服务
          const promptService = coreServices.getPromptService();
          const modelManager = coreServices.getModelManager();
          const templateManager = coreServices.getTemplateManager();

          // 检查 MCP 默认模型是否可用
          const mcpModel = await modelManager.getModel('mcp-default');
          if (!mcpModel || !mcpModel.enabled) {
            return {
              isError: true,
              content: [{
                type: "text",
                text: "Error: The MCP default model is not configured or not enabled. Check the environment configuration."
              }]
            };
          }

          const templateId = template || await getDefaultTemplateId(templateManager, 'iterate');
          const result = await promptService.iteratePrompt(
            prompt,
            prompt, // 使用原始提示词作为上次优化的提示词
            requirements,
            'mcp-default',
            templateId
          );

          return {
            content: [{
              type: "text",
              text: result
            }]
          };
        }

        default:
          return {
            isError: true,
            content: [{
              type: "text",
              text: `Error: Unknown tool '${name}'`
            }]
          };
      }
    } catch (error) {
      logger.error(`Tool execution error ${name}:`, error as Error);
      return {
        isError: true,
        content: [{
          type: "text",
          text: "Tool execution failed. Please check your parameters or try again later."
        }]
      };
    }
  });

  logger.info('MCP tools registered successfully');
}

async function main() {
  const config = loadConfig();
  logger.setLogLevel(config.logLevel);

  try {
    // 解析命令行参数
    const args = process.argv.slice(2);
    const transport = args.find(arg => arg.startsWith('--transport='))?.split('=')[1] || 'stdio';
    const port = parseInt(args.find(arg => arg.startsWith('--port='))?.split('=')[1] || config.httpPort.toString());

    logger.info('Starting MCP Server for Prompt Optimizer');
    logger.info(`Node.js runtime: ${process.version}`);
    logger.info(`Transport: ${transport}, Port: ${port}`);

    // 初始化 Core 服务（一次性，用于验证配置）
    logger.info('Initializing Core services...');
    const coreServices = CoreServicesManager.getInstance();
    await coreServices.initialize(config);
    logger.info('Core services initialized successfully');

    // 启动传输层
    if (transport === 'http') {
      logger.info('Starting HTTP server with session management...');
      const { app } = createMcpHttpApp({
        port,
        env: process.env,
        healthProvider: coreServices,
        createSessionServer: async () => {
          const { server } = await createServerInstance(config);
          await setupServerHandlers(server, coreServices);
          return server;
        }
      });

      logger.info('Setting up HTTP server listener...');
      app.listen(port, () => {
        logger.info(`MCP Server running on HTTP port ${port} with session management`);
      });
      logger.info('HTTP server setup completed');
    } else {
      // stdio 模式 - 创建单个服务器实例
      const { server } = await createServerInstance(config);
      await setupServerHandlers(server, coreServices);

      const stdioTransport = new StdioServerTransport();
      await server.connect(stdioTransport);
      logger.info('MCP Server running on stdio');
    }

  } catch (error) {
    // 确保错误信息始终显示，即使没有启用 DEBUG
    console.error('❌ MCP Server startup failed:');
    console.error('   ', (error as Error).message);

    // 同时使用 debug 库记录详细信息
    logger.error('Failed to start MCP Server', error as Error);

    process.exit(1);
  }
}

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// 导出 main 与核心工厂函数供外部调用及测试
export { main, setupServerHandlers, createMcpHttpApp };

// 创建一个单独的启动文件，避免在构建时执行
