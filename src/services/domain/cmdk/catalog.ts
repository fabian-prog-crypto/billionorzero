import { TOOL_REGISTRY } from '../tool-registry';
import type { CommandDefinition } from './contracts';

export const COMMAND_CATALOG: CommandDefinition[] = TOOL_REGISTRY.map((tool) => ({
  id: tool.id,
  kind: tool.type,
  description: tool.description,
  args: tool.fields,
  examples: tool.examples,
}));
