import type { CommandFrame, ExecutionPlan, ResolutionResult } from './contracts';

export function buildExecutionPlan(frame: CommandFrame, resolution: ResolutionResult): ExecutionPlan {
  const status = resolution.status === 'matched' ? 'ready' : 'needs_clarification';
  return {
    commandId: frame.commandId,
    kind: frame.kind,
    status,
    resolvedArgs: {
      ...frame.args,
      ...(resolution.target || {}),
    },
    warnings: resolution.warnings,
  };
}
