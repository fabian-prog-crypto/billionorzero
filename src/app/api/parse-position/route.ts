import { NextRequest, NextResponse } from 'next/server';
import { buildSystemPrompt, PositionContext } from '@/services/domain/prompt-builder';
import { resolveAction } from '@/services/domain/action-resolver';

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
    const today = new Date().toISOString().split('T')[0];

    const systemPrompt = buildSystemPrompt(positions, today);

    const jsonSchema = {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['buy', 'sell_partial', 'sell_all', 'update', 'add_cash', 'remove', 'update_cash', 'set_price'],
        },
        symbol: { type: 'string' },
        name: { type: 'string' },
        assetType: {
          type: 'string',
          enum: ['crypto', 'stock', 'etf', 'cash', 'manual'],
        },
        amount: { type: 'number' },
        pricePerUnit: { type: 'number' },
        totalCost: { type: 'number' },
        sellAmount: { type: 'number' },
        sellPercent: { type: 'number' },
        sellPrice: { type: 'number' },
        totalProceeds: { type: 'number' },
        date: { type: 'string' },
        matchedPositionId: { type: 'string' },
        missingFields: {
          type: 'array',
          items: { type: 'string' },
        },
        confidence: { type: 'number' },
        summary: { type: 'string' },
        currency: { type: 'string' },
        accountName: { type: 'string' },
        newPrice: { type: 'number' },
      },
      required: ['action', 'symbol', 'assetType', 'confidence', 'summary'],
    };

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
    const resolved = resolveAction(parsed, text, positions);

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
