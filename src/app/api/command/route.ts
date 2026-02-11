import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { buildToolSchema } from '@/services/domain/tool-registry';

interface CommandRequest {
  text: string;
  context: string;
  ollamaUrl?: string;
  ollamaModel?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CommandRequest;
    const { text, context, ollamaUrl, ollamaModel } = body;

    if (!text || !text.trim()) {
      return NextResponse.json(
        { error: 'No text provided' },
        { status: 400 }
      );
    }

    const baseUrl = ollamaUrl || 'http://localhost:11434';
    const model = ollamaModel || 'llama3.2';

    // Read the api-reference.md system prompt
    const referencePath = path.join(
      process.cwd(),
      'src/services/domain/actions/api-reference.md'
    );
    const referenceContent = fs.readFileSync(referencePath, 'utf-8');

    // Build the system prompt: reference + portfolio context
    const systemPrompt = `${referenceContent}\n\n---\n\n## Current Portfolio Context\n\n${context}`;

    // Use the tool registry to build a structured JSON schema
    const jsonSchema = buildToolSchema();

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        format: jsonSchema,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 404) {
        return NextResponse.json(
          { error: `Model "${model}" not found. Run: ollama pull ${model}` },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: `Ollama error: ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const content = data.message?.content;

    if (!content) {
      return NextResponse.json(
        { error: 'No response from Ollama' },
        { status: 500 }
      );
    }

    const parsed = JSON.parse(content) as {
      tool: string;
      args: Record<string, unknown>;
      confidence: number;
    };

    return NextResponse.json(parsed);
  } catch (error) {
    if (
      error instanceof TypeError &&
      (error.message.includes('fetch') || error.message.includes('ECONNREFUSED'))
    ) {
      return NextResponse.json(
        {
          error:
            'Cannot connect to Ollama. Make sure Ollama is running (ollama serve).',
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      {
        error: `Failed to parse command: ${error instanceof Error ? error.message : String(error)}`,
      },
      { status: 500 }
    );
  }
}
