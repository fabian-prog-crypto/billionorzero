'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { usePortfolioStore } from '@/store/portfolioStore';
import { useCommandHistory } from '@/hooks/useCommandHistory';
import { MutationPreview, QueryResult } from '@/services/domain/command-types';
import { getToolById } from '@/services/domain/tool-registry';
import { executeQuery } from '@/services/domain/query-executor';
import { previewMutation, executeMutation } from '@/services/domain/mutation-executor';
import type { WalletConnection, CexConnection } from '@/types';

// ─── Navigation Routes ──────────────────────────────────────────────────────

const PAGE_ROUTES: Record<string, string> = {
  dashboard: '/',
  positions: '/positions',
  crypto: '/crypto',
  equities: '/equities',
  cash: '/cash',
  exposure: '/exposure',
  performance: '/performance',
  settings: '/settings',
  wallets: '/crypto/wallets',
  perps: '/perps',
  other: '/other',
};

// ─── Portfolio Context Builder ───────────────────────────────────────────────

function buildPortfolioContext(): string {
  const store = usePortfolioStore.getState();
  const { positions, accounts } = store;
  const lines: string[] = [];

  // Accounts
  if (accounts.length > 0) {
    lines.push('Accounts:');
    for (const a of accounts) {
      const ds = a.connection.dataSource;
      if (ds === 'debank' || ds === 'helius') {
        const conn = a.connection as WalletConnection;
        lines.push(`  ${a.name} (wallet, ${conn.address.slice(0, 6)}...${conn.address.slice(-4)}, chains: ${(conn.chains || []).join(', ')})`);
      } else if (ds === 'binance' || ds === 'coinbase' || ds === 'kraken' || ds === 'okx') {
        lines.push(`  ${a.name} (${ds})`);
      } else if (a.slug) {
        lines.push(`  ${a.name} (cash account)`);
      } else {
        lines.push(`  ${a.name} (brokerage)`);
      }
    }
    lines.push('');
  }

  // Split positions by mutability
  const walletIds = new Set(
    accounts.filter((a) => a.connection.dataSource === 'debank' || a.connection.dataSource === 'helius').map((a) => a.id)
  );
  const mutablePositions = positions.filter(
    (p) => !p.accountId || !walletIds.has(p.accountId)
  );
  const readOnlyPositions = positions.filter(
    (p) => p.accountId && walletIds.has(p.accountId)
  );

  // Deduplicate wallet positions by symbol
  const seenWalletSymbols = new Set<string>();

  if (mutablePositions.length > 0) {
    lines.push('Mutable positions:');
    for (const p of mutablePositions) {
      const account = p.accountId
        ? accounts.find((a) => a.id === p.accountId)
        : null;
      const accountStr = account ? `, ${account.name}` : '';
      if (p.type === 'cash') {
        lines.push(`  ${p.name} (${p.amount}) - cash${accountStr}`);
      } else {
        lines.push(`  ${p.symbol} (${p.amount}) - ${p.type}${accountStr}`);
      }
    }
    lines.push('');
  }

  if (readOnlyPositions.length > 0) {
    lines.push('Read-only (from sync):');
    for (const p of readOnlyPositions) {
      const key = p.symbol.toUpperCase();
      if (seenWalletSymbols.has(key)) continue;
      seenWalletSymbols.add(key);
      const account = p.accountId
        ? accounts.find((a) => a.id === p.accountId)
        : null;
      lines.push(`  ${p.symbol} (${p.amount}) - ${account?.name || 'wallet'}`);
    }
  }

  return lines.join('\n');
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useCommandPalette() {
  const [text, setText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [mutationPreview, setMutationPreview] = useState<MutationPreview | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const { recentCommands, addCommand } = useCommandHistory();

  const reset = useCallback(() => {
    setText('');
    setIsLoading(false);
    setLoadingText('');
    setQueryResult(null);
    setMutationPreview(null);
    setSuccessMessage(null);
    setError(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const submit = useCallback(async () => {
    if (!text.trim() || isLoading) return;

    setIsLoading(true);
    setLoadingText(text.trim());
    setError(null);
    setQueryResult(null);
    setMutationPreview(null);

    try {
      const ollamaUrl =
        (typeof window !== 'undefined' && localStorage.getItem('ollama_url')) ||
        'http://localhost:11434';
      const ollamaModel =
        (typeof window !== 'undefined' && localStorage.getItem('ollama_model')) ||
        'llama3.2';
      const context = buildPortfolioContext();

      const response = await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          context,
          ollamaUrl,
          ollamaModel,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to parse command');
      }

      const { tool, args } = data as {
        tool: string;
        args: Record<string, unknown>;
        confidence: number;
      };
      addCommand(text.trim());

      // Route by tool type
      const toolDef = getToolById(tool);
      if (!toolDef) {
        setError(`Unknown tool: ${tool}`);
        return;
      }

      switch (toolDef.type) {
        case 'query': {
          const result = executeQuery(tool, args);
          setQueryResult(result);
          break;
        }
        case 'mutation': {
          const preview = previewMutation(tool, args);
          setMutationPreview(preview);
          break;
        }
        case 'navigation': {
          const page = args.page as string;
          const route = PAGE_ROUTES[page] || '/';
          router.push(route);
          setSuccessMessage(`Navigating to ${page}...`);
          break;
        }
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to parse command';
      if (message.includes('Cannot connect') || message.includes('fetch')) {
        setError(
          'Cannot connect to Ollama. Make sure it is running (ollama serve).'
        );
      } else {
        setError(message);
      }
    } finally {
      setIsLoading(false);
    }
  }, [text, isLoading, router, addCommand]);

  const confirmMutation = useCallback(() => {
    if (!mutationPreview) return;

    const result = executeMutation(
      mutationPreview.tool,
      mutationPreview.resolvedArgs
    );

    if (result.success) {
      setMutationPreview(null);
      setSuccessMessage(result.summary || 'Done');
    } else {
      setError(result.error || 'Operation failed');
      setMutationPreview(null);
    }
  }, [mutationPreview]);

  const cancelMutation = useCallback(() => {
    setMutationPreview(null);
  }, []);

  return {
    text,
    setText,
    isLoading,
    loadingText,
    queryResult,
    mutationPreview,
    successMessage,
    error,
    submit,
    confirmMutation,
    cancelMutation,
    clearError,
    reset,
    recentCommands,
  };
}
