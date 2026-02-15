import type { PortfolioData } from '@/app/api/portfolio/db-store';
import type { CommandFrame, ExecutionPlan, ResolutionResult } from './contracts';
import { buildCommandFrameFromToolCall } from './frame-builder';
import { resolveCommandTarget } from './resolver';
import { buildExecutionPlan } from './plan-builder';

export interface CmdkPipelineResult {
  frame: CommandFrame;
  resolution: ResolutionResult;
  plan: ExecutionPlan;
}

export function buildCmdkPipelineResult(
  commandId: string,
  args: Record<string, unknown>,
  userText: string,
  db: PortfolioData,
): CmdkPipelineResult {
  const frame = buildCommandFrameFromToolCall(commandId, args, userText);
  const resolution = resolveCommandTarget(frame, { accounts: db.accounts, positions: db.positions });
  const plan = buildExecutionPlan(frame, resolution);

  return { frame, resolution, plan };
}
