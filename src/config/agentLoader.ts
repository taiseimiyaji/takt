/**
 * Re-export shim — actual implementation in loaders/agentLoader.ts
 */
export {
  loadAgentsFromDir,
  loadCustomAgents,
  listCustomAgents,
  loadAgentPrompt,
  loadAgentPromptFromPath,
} from './loaders/agentLoader.js';
