import { MenuItem } from './types';
import { getFiatCurrencies } from '../category-service';

/**
 * Build the system prompt for the menu-driven LLM approach.
 * The LLM sees a concrete numbered menu and just picks one + extracts values.
 */
export function buildMenuPrompt(menu: MenuItem[]): string {
  const menuLines = menu.map(item => {
    const fieldsDesc = item.fields.length > 0
      ? item.fields.map(f => `${f.name}${f.required ? '' : '?'}`).join(', ')
      : 'nothing';
    return `${item.id.padEnd(35)} | ${item.label.padEnd(35)} | ${item.description.padEnd(25)} | needs: ${fieldsDesc}`;
  }).join('\n');

  const fiatList = [...getFiatCurrencies()].map(c => c.toUpperCase()).sort().join(', ');

  return `Pick the best option and extract the needed values from the user's message.

ABBREVIATED NUMBERS:
- "50k" = "50000", "1.5m" = "1500000", "1b" = "1000000000"
- Always return abbreviations expanded as plain number strings

FIAT CURRENCIES: ${fiatList}

UPDATE POSITION RULES:
- "update/edit {SYMBOL} amount/cost basis/date to {VALUE}" → always update_position
- This applies to non-cash asset edits (crypto, stocks, equities)

CASH PATTERN RULES (apply BEFORE looking at the menu):
- "{NUM} {FIAT_CURRENCY} to/in/into {account}" → ALWAYS add_cash (adding to balance), NEVER update_cash or buy
  Examples: "5000 EUR to Revolut", "50k USD to IBKR", "3000 GBP in Wise"
- "{account} {FIAT_CURRENCY} to/is/=/balance {NUM}" → ALWAYS update_cash (setting balance)
  Examples: "N26 EUR to 4810", "Revolut EUR balance 5000", "Wise USD = 30000"
- ACCOUNT MATCHING: The account name in the user's input must appear in the menu item label. If the user says "to IBKR" but no add_cash item mentions "IBKR", use add_cash_generic — do NOT pick a different account's add_cash item
- When a fiat currency appears with "to {account}", it is NEVER a buy — even if the account name looks like a stock ticker

MENU:
${menuLines}

RULES:
- Pick the single best menuId from the MENU above
- Extract ONLY the values listed in "needs" for that item
- ALL values must be strings (numbers as digit strings like "4811", "95000")
- If a value is marked with "?" it is optional — only include if mentioned
- "at $X" or "at Xk" means per-unit price
- "for $X" means total cost/proceeds
- "half" = percent "50", "third" = percent "33.33", "quarter" = percent "25"
- Do NOT invent values not mentioned in the user's message

Respond with JSON matching the provided schema.`;
}

/**
 * Build the JSON schema for Ollama's structured output.
 * The menuId field uses an enum constraint so the model can only pick valid items.
 */
export function buildMenuJsonSchema(menu: MenuItem[]) {
  return {
    type: 'object',
    properties: {
      menuId: {
        type: 'string',
        enum: menu.map(item => item.id),
      },
      values: {
        type: 'object',
        additionalProperties: { type: 'string' },
      },
      confidence: {
        type: 'number',
      },
    },
    required: ['menuId', 'values', 'confidence'],
  };
}
