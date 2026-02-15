/**
 * @vitest-environment jsdom
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

function resolveSeedDbPath(): string {
  const primary = path.join(process.cwd(), 'data', 'db.json');
  if (fs.existsSync(primary)) return primary;
  const fallback = path.join(process.cwd(), 'portfolio-backup-11022026.json');
  if (fs.existsSync(fallback)) return fallback;
  throw new Error('Missing seed db.json and portfolio-backup-11022026.json for real-db QA tests.');
}

function cloneRealDbToTemp(): string {
  const src = resolveSeedDbPath();
  const tmpPath = path.join(
    os.tmpdir(),
    `db.chat-intent-first.${Date.now()}.${Math.random().toString(36).slice(2)}.json`
  );
  fs.copyFileSync(src, tmpPath);
  return tmpPath;
}

function makeOllamaResponse(message: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ message }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

async function invokeChat(text: string): Promise<Response> {
  const { POST } = await import('@/app/api/chat/route');
  const req = new NextRequest('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      text,
      ollamaUrl: 'http://localhost:11434',
      ollamaModel: 'llama3.2:latest',
    }),
  });
  return POST(req);
}

describe('chat route intent-first tool routing', () => {
  let tempDbPath = '';
  const originalDbEnv = process.env.PORTFOLIO_DB_PATH;

  beforeEach(() => {
    tempDbPath = cloneRealDbToTemp();
    process.env.PORTFOLIO_DB_PATH = tempDbPath;
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalDbEnv) {
      process.env.PORTFOLIO_DB_PATH = originalDbEnv;
    } else {
      delete process.env.PORTFOLIO_DB_PATH;
    }
    try {
      fs.unlinkSync(tempDbPath);
    } catch {
      // ignore
    }
  });

  it('starts with intent-sliced tools and falls back to full tools only after a no-tool response', async () => {
    const toolNameSets: string[][] = [];
    const responses: Array<Record<string, unknown>> = [
      { role: 'assistant', content: 'thinking...' }, // no tool calls -> triggers fallback
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            function: {
              name: 'query_net_worth',
              arguments: {},
            },
          },
        ],
      },
      { role: 'assistant', content: 'done' },
    ];
    let idx = 0;

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const requestBody = init?.body ? JSON.parse(String(init.body)) as { tools?: Array<{ function?: { name?: string } }> } : {};
      const toolNames = (requestBody.tools || [])
        .map((tool) => tool.function?.name)
        .filter((name): name is string => Boolean(name));
      toolNameSets.push(toolNames);

      const message = responses[idx] || responses[responses.length - 1];
      idx += 1;
      return makeOllamaResponse(message);
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await invokeChat("what's my net worth?");
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.toolCalls[0]?.tool).toBe('query_net_worth');
    expect(toolNameSets.length).toBeGreaterThanOrEqual(2);

    const firstPassTools = toolNameSets[0];
    const fallbackTools = toolNameSets[1];

    expect(firstPassTools).toContain('query_net_worth');
    expect(firstPassTools).not.toContain('buy_position');
    expect(fallbackTools).toContain('buy_position');
    expect(fallbackTools.length).toBeGreaterThan(firstPassTools.length);
  });
});
