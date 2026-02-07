import { NextRequest, NextResponse } from 'next/server';

interface PositionContext {
  id: string;
  symbol: string;
  name: string;
  type: string;
  amount: number;
  costBasis?: number;
}

function parseAbbreviatedNumber(raw: string): number | null {
  const cleaned = raw.replace(/[$,]/g, '').trim().toLowerCase();
  const match = cleaned.match(/^(\d+(?:\.\d+)?)\s*([kmb])?$/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  const suffix = match[2];
  if (suffix === 'k') return num * 1_000;
  if (suffix === 'm') return num * 1_000_000;
  if (suffix === 'b') return num * 1_000_000_000;
  return num;
}

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

    const positionsList = positions
      .map(
        (p) =>
          `- ${p.symbol.toUpperCase()} (${p.name}): ${p.amount} units, type=${p.type}, id="${p.id}"${p.costBasis ? `, costBasis=$${p.costBasis}` : ''}`
      )
      .join('\n');

    const systemPrompt = `You are a financial position parser. Given a natural language command about buying, selling, or updating a financial position, extract the structured data.

Current user positions:
${positionsList || '(no positions)'}

Today's date: ${today}

Rules:
- "sold 50%" or "sold half" → action: "sell_partial" with sellPercent
- "sold all" or "closed" or "exited" → action: "sell_all"
- "bought" or "purchased" or "added" → action: "buy"
- "updated" or "changed" → action: "update"
- Match the symbol to an existing position when possible, and set matchedPositionId to its id
- If the user says "sold 50 shares" that's sellAmount=50 (absolute), not sellPercent
- If the user says "sold 50%" that's sellPercent=50
- If a sell price is not mentioned, add "sellPrice" to missingFields
- If a buy price is not mentioned, add "pricePerUnit" to missingFields
- For date: "today" = ${today}, "yesterday" = use yesterday's date. If not mentioned, use ${today}
- assetType should be one of: "crypto", "stock", "etf", "cash", "manual"
- confidence: 0-1, how certain you are about the parsing
- summary: a human-readable summary like "Sell 50% of GOOG (15 shares)"
- totalProceeds = sellAmount * sellPrice (for sells, if both are known)
- totalCost = amount * pricePerUnit (for buys, if both are known)

Respond with valid JSON matching this exact schema.`;

    const jsonSchema = {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['buy', 'sell_partial', 'sell_all', 'update'],
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
          {
            error: `Model "${model}" not found. Run: ollama pull ${model}`,
          },
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

    // --- Text-extraction fallback for numeric values the LLM missed ---
    // Common patterns: "Bought 10 AAPL at $185", "Sold 50 shares at $200"

    // Extract amount: "bought 10 ...", "purchased 100 ..."
    const buyAmountMatch = text.match(
      /(?:bought|purchased|added|buy)\s+(\d+(?:\.\d+)?)\s/i
    );
    if (buyAmountMatch && !parsed.amount) {
      parsed.amount = parseFloat(buyAmountMatch[1]);
    }

    // Extract price: "at $185", "at 185", "@ $50.25", "at $3.2k"
    // "at/@ $X" = per-unit price
    const perUnitMatch = text.match(/(?:at|@)\s*(\$?\d+(?:\.\d+)?[kmb]?)/i);
    if (perUnitMatch) {
      const price = parseAbbreviatedNumber(perUnitMatch[1]);
      if (price !== null) {
        if (parsed.action === 'buy' && !parsed.pricePerUnit) {
          parsed.pricePerUnit = price;
        }
        if (
          (parsed.action === 'sell_partial' || parsed.action === 'sell_all') &&
          !parsed.sellPrice
        ) {
          parsed.sellPrice = price;
        }
      }
    }

    // "for $X" = total proceeds (sell) or total cost (buy)
    const forTotalMatch = text.match(/for\s+(\$?\d+(?:\.\d+)?[kmb]?)/i);
    if (forTotalMatch) {
      const total = parseAbbreviatedNumber(forTotalMatch[1]);
      if (total !== null) {
        const isSellAction =
          parsed.action === 'sell_partial' || parsed.action === 'sell_all';
        if (isSellAction && !parsed.totalProceeds) {
          parsed.totalProceeds = total;
        }
        if (parsed.action === 'buy' && !parsed.totalCost) {
          parsed.totalCost = total;
        }
      }
    }

    // Extract sell percent: "sold 50%", "sold half"
    if (!parsed.sellPercent && parsed.action === 'sell_partial') {
      const percentMatch = text.match(/(\d+)\s*%/i);
      if (percentMatch) {
        parsed.sellPercent = parseFloat(percentMatch[1]);
      } else if (/\bhalf\b/i.test(text)) {
        parsed.sellPercent = 50;
      } else if (/\bthird\b/i.test(text)) {
        parsed.sellPercent = 33.33;
      } else if (/\bquarter\b/i.test(text)) {
        parsed.sellPercent = 25;
      }
    }

    // Extract sell amount: "sold 50 shares", "sold 10 GOOG"
    // This runs for both sell_partial AND sell_all — the LLM sometimes says
    // sell_all when the user specifies a partial quantity
    if (
      !parsed.sellAmount &&
      !parsed.sellPercent &&
      (parsed.action === 'sell_partial' || parsed.action === 'sell_all')
    ) {
      const sellAmountMatch = text.match(
        /(?:sold|sell)\s+(\d+(?:\.\d+)?)\s+(?:shares?|units?|\w)/i
      );
      if (sellAmountMatch) {
        parsed.sellAmount = parseFloat(sellAmountMatch[1]);
      }
    }

    // Normalize symbol to uppercase
    if (parsed.symbol) {
      parsed.symbol = parsed.symbol.toUpperCase();
    }

    // Default date to today if not provided; validate format and reject future dates
    if (!parsed.date) {
      parsed.date = today;
    } else {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(parsed.date) || isNaN(Date.parse(parsed.date)) || parsed.date > today) {
        parsed.date = today;
      }
    }

    // Auto-match to existing position if not already matched
    if (!parsed.matchedPositionId && parsed.symbol) {
      const matches = positions.filter(
        (p) => p.symbol.toUpperCase() === parsed.symbol.toUpperCase()
      );
      if (matches.length === 1) {
        parsed.matchedPositionId = matches[0].id;
        parsed.name = parsed.name || matches[0].name;
        parsed.assetType = parsed.assetType || matches[0].type;
      }
    }

    // Override sell_all → sell_partial if a specific quantity < full position
    if (parsed.action === 'sell_all' && parsed.sellAmount && parsed.matchedPositionId) {
      const matchedPos = positions.find(
        (p) => p.id === parsed.matchedPositionId
      );
      if (matchedPos && parsed.sellAmount < matchedPos.amount) {
        parsed.action = 'sell_partial';
      }
    }

    // Calculate sellAmount from sellPercent if we have a matched position
    if (
      parsed.action === 'sell_partial' &&
      parsed.sellPercent &&
      !parsed.sellAmount &&
      parsed.matchedPositionId
    ) {
      const matchedPos = positions.find(
        (p) => p.id === parsed.matchedPositionId
      );
      if (matchedPos) {
        parsed.sellAmount = matchedPos.amount * (parsed.sellPercent / 100);
      }
    }

    // --- Robust post-processing to fix common LLM mistakes ---

    const isSell =
      parsed.action === 'sell_partial' || parsed.action === 'sell_all';
    const isBuy = parsed.action === 'buy';

    // For buys: derive/fix amount, pricePerUnit, and totalCost
    if (isBuy) {
      if (!parsed.pricePerUnit && parsed.totalCost && parsed.amount) {
        parsed.pricePerUnit = parsed.totalCost / parsed.amount;
      }
      if (!parsed.amount && parsed.totalCost && parsed.pricePerUnit) {
        parsed.amount = parsed.totalCost / parsed.pricePerUnit;
      }
      // Always recalculate totalCost when both amount and pricePerUnit are known
      if (parsed.amount && parsed.pricePerUnit) {
        parsed.totalCost = parsed.amount * parsed.pricePerUnit;
      }
    }

    // For sells: derive sellAmount from matched position if sell_all
    if (parsed.action === 'sell_all' && parsed.matchedPositionId) {
      const matchedPos = positions.find(
        (p) => p.id === parsed.matchedPositionId
      );
      if (matchedPos) {
        parsed.sellAmount = matchedPos.amount;
      }
    }

    // Derive sellPrice from totalProceeds / sellAmount
    if (isSell && !parsed.sellPrice && parsed.totalProceeds && parsed.sellAmount) {
      parsed.sellPrice = parsed.totalProceeds / parsed.sellAmount;
    }
    // Recalculate totalProceeds when both sellAmount and sellPrice are known
    if (isSell && parsed.sellAmount && parsed.sellPrice) {
      parsed.totalProceeds = parsed.sellAmount * parsed.sellPrice;
    }

    // Rebuild missingFields from scratch (don't trust LLM's version)
    parsed.missingFields = [];
    if (isSell && !parsed.sellPrice) {
      parsed.missingFields.push('sellPrice');
    }
    if (isSell && parsed.action === 'sell_partial' && !parsed.sellAmount) {
      parsed.missingFields.push('sellAmount');
    }
    if (isBuy && !parsed.amount) {
      parsed.missingFields.push('amount');
    }
    if (isBuy && !parsed.pricePerUnit) {
      parsed.missingFields.push('pricePerUnit');
    }

    // Rebuild summary from post-processed values (don't trust LLM summary)
    const fmtPrice = (n: number) =>
      n >= 1
        ? '$' + n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })
        : '$' + n.toString();

    if (isSell) {
      const matchedPos = parsed.matchedPositionId
        ? positions.find((p: PositionContext) => p.id === parsed.matchedPositionId)
        : null;
      let qtyPart: string;
      if (parsed.sellPercent) {
        qtyPart = `${parsed.sellPercent}% of`;
      } else if (parsed.sellAmount) {
        const pct = matchedPos && matchedPos.amount > 0
          ? Math.round((parsed.sellAmount / matchedPos.amount) * 100)
          : null;
        qtyPart = pct !== null ? `${parsed.sellAmount} (${pct}%) of` : `${parsed.sellAmount}`;
      } else {
        qtyPart = 'all';
      }
      const pricePart = parsed.sellPrice
        ? ` at ${fmtPrice(parsed.sellPrice)}`
        : '';
      parsed.summary = `Sell ${qtyPart} ${parsed.symbol}${pricePart}`;
    } else if (isBuy) {
      const qtyPart = parsed.amount ? `${parsed.amount}` : '';
      const pricePart = parsed.pricePerUnit
        ? ` at ${fmtPrice(parsed.pricePerUnit)}`
        : '';
      parsed.summary = `Buy ${qtyPart} ${parsed.symbol}${pricePart}`;
    }

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
      { error: `Failed to parse: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
