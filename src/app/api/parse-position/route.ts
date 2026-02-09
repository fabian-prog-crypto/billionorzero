import { NextRequest, NextResponse } from 'next/server';
import { PositionContext } from '@/services/domain/actions/types';
import { getActionCatalog } from '@/services/domain/actions/action-catalog';
import { buildMenuPrompt, buildMenuJsonSchema } from '@/services/domain/actions/menu-prompt-builder';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, positions, ollamaUrl, ollamaModel } = body as {
      text: string;
      positions: PositionContext[];
      ollamaUrl?: string;
      ollamaModel?: string;
    };

    if (!text || !text.trim()) {
      return NextResponse.json(
        { error: 'No text provided' },
        { status: 400 }
      );
    }

    const baseUrl = ollamaUrl || 'http://localhost:11434';
    const model = ollamaModel || 'llama3.2';

    const catalog = getActionCatalog();
    const menu = catalog.generateFilteredMenu(positions, text);
    const systemPrompt = buildMenuPrompt(menu);
    const jsonSchema = buildMenuJsonSchema(menu);

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

    const parsed = JSON.parse(content);
    const resolved = catalog.resolve(parsed, positions);

    return NextResponse.json(resolved);
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
      { error: `Failed to parse: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
