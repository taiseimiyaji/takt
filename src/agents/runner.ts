/**
 * Agent execution runners
 */

import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import {
  callClaudeAgent,
  callClaudeSkill,
  type ClaudeCallOptions,
} from '../infra/claude/index.js';
import { loadCustomAgents, loadAgentPrompt, loadGlobalConfig, loadProjectConfig } from '../infra/config/index.js';
import { getProvider, type ProviderType, type ProviderCallOptions } from '../infra/providers/index.js';
import type { AgentResponse, CustomAgentConfig } from '../core/models/index.js';
import { createLogger } from '../shared/utils/index.js';
import { loadTemplate } from '../shared/prompts/index.js';
import type { RunAgentOptions } from './types.js';

export type { RunAgentOptions, StreamCallback } from './types.js';

const log = createLogger('runner');

/**
 * Agent execution runner.
 *
 * Resolves agent configuration (provider, model, prompt) and
 * delegates execution to the appropriate provider.
 */
export class AgentRunner {
  /** Resolve provider type from options, agent config, project config, global config */
  private static resolveProvider(
    cwd: string,
    options?: RunAgentOptions,
    agentConfig?: CustomAgentConfig,
  ): ProviderType {
    if (options?.provider) return options.provider;
    if (agentConfig?.provider) return agentConfig.provider;
    const projectConfig = loadProjectConfig(cwd);
    if (projectConfig.provider) return projectConfig.provider;
    try {
      const globalConfig = loadGlobalConfig();
      if (globalConfig.provider) return globalConfig.provider;
    } catch {
      // Ignore missing global config; fallback below
    }
    return 'claude';
  }

  /** Resolve model from options, agent config, global config */
  private static resolveModel(
    cwd: string,
    options?: RunAgentOptions,
    agentConfig?: CustomAgentConfig,
  ): string | undefined {
    if (options?.model) return options.model;
    if (agentConfig?.model) return agentConfig.model;
    try {
      const globalConfig = loadGlobalConfig();
      if (globalConfig.model) return globalConfig.model;
    } catch {
      // Ignore missing global config
    }
    return undefined;
  }

  /** Load persona prompt from file path */
  private static loadPersonaPromptFromPath(personaPath: string): string {
    if (!existsSync(personaPath)) {
      throw new Error(`Persona file not found: ${personaPath}`);
    }
    return readFileSync(personaPath, 'utf-8');
  }

  /**
   * Get persona name from path or spec.
   * For personas in subdirectories, includes parent dir for pattern matching.
   */
  private static extractPersonaName(personaSpec: string): string {
    if (!personaSpec.endsWith('.md')) {
      return personaSpec;
    }

    const name = basename(personaSpec, '.md');
    const dir = basename(dirname(personaSpec));

    if (dir === 'personas' || dir === '.') {
      return name;
    }

    return `${dir}/${name}`;
  }

  /** Run a custom agent */
  async runCustom(
    agentConfig: CustomAgentConfig,
    task: string,
    options: RunAgentOptions,
  ): Promise<AgentResponse> {
    const allowedTools = options.allowedTools ?? agentConfig.allowedTools;

    // If agent references a Claude Code agent
    if (agentConfig.claudeAgent) {
      const callOptions: ClaudeCallOptions = {
        cwd: options.cwd,
        sessionId: options.sessionId,
        allowedTools,
        maxTurns: options.maxTurns,
        model: AgentRunner.resolveModel(options.cwd, options, agentConfig),
        permissionMode: options.permissionMode,
        onStream: options.onStream,
        onPermissionRequest: options.onPermissionRequest,
        onAskUserQuestion: options.onAskUserQuestion,
        bypassPermissions: options.bypassPermissions,
      };
      return callClaudeAgent(agentConfig.claudeAgent, task, callOptions);
    }

    // If agent references a Claude Code skill
    if (agentConfig.claudeSkill) {
      const callOptions: ClaudeCallOptions = {
        cwd: options.cwd,
        sessionId: options.sessionId,
        allowedTools,
        maxTurns: options.maxTurns,
        model: AgentRunner.resolveModel(options.cwd, options, agentConfig),
        permissionMode: options.permissionMode,
        onStream: options.onStream,
        onPermissionRequest: options.onPermissionRequest,
        onAskUserQuestion: options.onAskUserQuestion,
        bypassPermissions: options.bypassPermissions,
      };
      return callClaudeSkill(agentConfig.claudeSkill, task, callOptions);
    }

    // Custom agent with prompt
    const systemPrompt = loadAgentPrompt(agentConfig);

    const providerType = AgentRunner.resolveProvider(options.cwd, options, agentConfig);
    const provider = getProvider(providerType);

    const callOptions: ProviderCallOptions = {
      cwd: options.cwd,
      sessionId: options.sessionId,
      allowedTools,
      maxTurns: options.maxTurns,
      model: AgentRunner.resolveModel(options.cwd, options, agentConfig),
      permissionMode: options.permissionMode,
      onStream: options.onStream,
      onPermissionRequest: options.onPermissionRequest,
      onAskUserQuestion: options.onAskUserQuestion,
      bypassPermissions: options.bypassPermissions,
    };

    return provider.callCustom(agentConfig.name, task, systemPrompt, callOptions);
  }

  /** Build ProviderCallOptions from RunAgentOptions with optional systemPrompt override */
  private static buildProviderCallOptions(
    options: RunAgentOptions,
    systemPrompt?: string,
  ): ProviderCallOptions {
    return {
      cwd: options.cwd,
      sessionId: options.sessionId,
      allowedTools: options.allowedTools,
      maxTurns: options.maxTurns,
      model: AgentRunner.resolveModel(options.cwd, options),
      systemPrompt,
      permissionMode: options.permissionMode,
      onStream: options.onStream,
      onPermissionRequest: options.onPermissionRequest,
      onAskUserQuestion: options.onAskUserQuestion,
      bypassPermissions: options.bypassPermissions,
    };
  }

  /** Run an agent by name, path, inline prompt string, or no agent at all */
  async run(
    personaSpec: string | undefined,
    task: string,
    options: RunAgentOptions,
  ): Promise<AgentResponse> {
    const personaName = personaSpec ? AgentRunner.extractPersonaName(personaSpec) : 'default';
    log.debug('Running agent', {
      personaSpec: personaSpec ?? '(none)',
      personaName,
      provider: options.provider,
      model: options.model,
      hasPersonaPath: !!options.personaPath,
      hasSession: !!options.sessionId,
      permissionMode: options.permissionMode,
    });

    // 1. If personaPath is provided (resolved file exists), load prompt from file
    //    and wrap it through the perform_agent_system_prompt template
    if (options.personaPath) {
      const agentDefinition = AgentRunner.loadPersonaPromptFromPath(options.personaPath);
      const language = options.language ?? 'en';
      const templateVars: Record<string, string> = { agentDefinition };

      // Add piece meta information if available
      if (options.pieceMeta) {
        templateVars.pieceName = options.pieceMeta.pieceName;
        templateVars.pieceDescription = options.pieceMeta.pieceDescription ?? '';
        templateVars.currentMovement = options.pieceMeta.currentMovement;
        templateVars.movementsList = options.pieceMeta.movementsList
          .map((m, i) => `${i + 1}. ${m.name}${m.description ? ` - ${m.description}` : ''}`)
          .join('\n');
        templateVars.currentPosition = options.pieceMeta.currentPosition;
      }

      const systemPrompt = loadTemplate('perform_agent_system_prompt', language, templateVars);
      const providerType = AgentRunner.resolveProvider(options.cwd, options);
      const provider = getProvider(providerType);
      return provider.call(personaName, task, AgentRunner.buildProviderCallOptions(options, systemPrompt));
    }

    // 2. If personaSpec is provided but no personaPath (file not found), try custom agent first,
    //    then use the string as inline system prompt
    if (personaSpec) {
      const customAgents = loadCustomAgents();
      const agentConfig = customAgents.get(personaName);
      if (agentConfig) {
        return this.runCustom(agentConfig, task, options);
      }

      // Use personaSpec string as inline system prompt
      const providerType = AgentRunner.resolveProvider(options.cwd, options);
      const provider = getProvider(providerType);
      return provider.call(personaName, task, AgentRunner.buildProviderCallOptions(options, personaSpec));
    }

    // 3. No persona specified — run with instruction_template only (no system prompt)
    const providerType = AgentRunner.resolveProvider(options.cwd, options);
    const provider = getProvider(providerType);
    return provider.call(personaName, task, AgentRunner.buildProviderCallOptions(options));
  }
}

// ---- Module-level function facade ----

const defaultRunner = new AgentRunner();

export async function runAgent(
  personaSpec: string | undefined,
  task: string,
  options: RunAgentOptions,
): Promise<AgentResponse> {
  return defaultRunner.run(personaSpec, task, options);
}
