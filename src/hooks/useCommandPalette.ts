'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useCommandHistory } from '@/hooks/useCommandHistory';
import { getOrRefreshToken, refreshToken } from '@/lib/api-token';
import { mapQueryToolResult } from '@/services/domain/cmdk/query-result';
import type { QueryResult } from '@/services/domain/command-types';
import type { ParsedPositionAction } from '@/types';

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

// ─── Types ────────────────────────────────────────────────────────────────────

export type PaletteMode = 'commands' | 'loading' | 'result' | 'success' | 'error';

interface ChatResponse {
  response: string;
  toolCalls: {
    tool: string;
    args: Record<string, unknown>;
    result: unknown;
    isMutation: boolean;
  }[];
  mutations: boolean;
  pendingAction?: ParsedPositionAction;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useCommandPalette() {
  const [text, setText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [llmResponse, setLlmResponse] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<ParsedPositionAction | null>(null);

  const router = useRouter();
  const { recentCommands, addCommand } = useCommandHistory();

  // ─── Derived mode ──────────────────────────────────────────────────────────

  const mode: PaletteMode = (() => {
    if (successMessage) return 'success';
    if (error) return 'error';
    if (isLoading) return 'loading';
    if (queryResult || llmResponse) return 'result';
    return 'commands';
  })();

  const reset = useCallback(() => {
    setText('');
    setIsLoading(false);
    setLoadingText('');
    setQueryResult(null);
    setLlmResponse(null);
    setSuccessMessage(null);
    setError(null);
    setPendingAction(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  // Check for navigation intent in tool calls
  const handleNavigation = useCallback((toolCalls: ChatResponse['toolCalls']) => {
    const navCall = toolCalls.find(tc => tc.tool === 'navigate');
    if (navCall) {
      const page = navCall.args.page as string;
      const route = PAGE_ROUTES[page] || '/';
      router.push(route);
      return true;
    }
    return false;
  }, [router]);

  const submitText = useCallback(async (input: string) => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    setIsLoading(true);
    setLoadingText(trimmed);
    setError(null);
    setQueryResult(null);
    setLlmResponse(null);

    try {
      const ollamaUrl =
        (typeof window !== 'undefined' && localStorage.getItem('ollama_url')) ||
        'http://localhost:11434';
      const ollamaModel =
        (typeof window !== 'undefined' && localStorage.getItem('ollama_model')) ||
        'llama3.2:latest';

      const token = await getOrRefreshToken();

      const makeRequest = async (authToken: string | null) => {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (authToken) {
          headers['Authorization'] = `Bearer ${authToken}`;
        }
        return fetch('/api/chat', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            text: trimmed,
            ollamaUrl,
            ollamaModel,
          }),
        });
      };

      let response = await makeRequest(token);

      // Auto-retry on 401: refresh token and try once more
      if (response.status === 401) {
        const freshToken = await refreshToken();
        if (freshToken) {
          response = await makeRequest(freshToken);
        }
      }

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Session expired. Please refresh the page.');
        }
        throw new Error(data.error || 'Failed to process command');
      }

      const chatResponse = data as ChatResponse;
      addCommand(trimmed);

      // Check for navigation
      if (chatResponse.toolCalls && handleNavigation(chatResponse.toolCalls)) {
        setSuccessMessage('Navigating...');
        return;
      }

      // If server returned a pending mutation action, surface it for confirmation
      if (chatResponse.pendingAction) {
        setPendingAction(chatResponse.pendingAction);
        return;
      }

      // Prefer structured query results when available
      if (chatResponse.toolCalls && chatResponse.toolCalls.length > 0) {
        const queryCall = chatResponse.toolCalls.find(
          (call) => !call.isMutation && call.tool.startsWith('query_')
        );
        if (queryCall) {
          const mapped = mapQueryToolResult(queryCall.tool, queryCall.result);
          if (mapped) {
            setQueryResult(mapped);
            return;
          }
        }
      }

      // If mutations were made (non-confirmable like toggles), show success
      if (chatResponse.mutations) {
        setSuccessMessage(chatResponse.response || 'Changes applied');
        return;
      }

      // Show LLM response
      if (chatResponse.response) {
        setLlmResponse(chatResponse.response);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to process command';
      if (message.includes('Cannot connect') || message.includes('fetch') || message.includes('Ollama not reachable')) {
        setError(
          'Cannot connect to Ollama. Make sure it is running (ollama serve).'
        );
      } else {
        setError(message);
      }
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, addCommand, handleNavigation]);

  const submit = useCallback(async () => {
    await submitText(text);
  }, [text, submitText]);

  const cancelMutation = useCallback(() => {
    setLlmResponse(null);
    setPendingAction(null);
  }, []);

  return {
    text,
    setText,
    mode,
    isLoading,
    loadingText,
    queryResult,
    llmResponse,
    successMessage,
    error,
    submit,
    submitText,
    cancelMutation,
    clearError,
    reset,
    recentCommands,
    pendingAction,
    setPendingAction,
  };
}
