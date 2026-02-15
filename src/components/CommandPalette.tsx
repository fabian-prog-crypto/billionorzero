'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Command } from 'cmdk';
import { MessageSquare, X, AlertCircle, Settings, Check } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCommandPalette } from '@/hooks/useCommandPalette';
import { QueryResultView } from '@/components/CommandResult';
import { usePortfolioStore } from '@/store/portfolioStore';
import { calculateAllPositionsWithPrices } from '@/services/domain/portfolio-calculator';
import ConfirmPositionActionModal from '@/components/modals/ConfirmPositionActionModal';
import { getSuggestions, isPartialCommand } from '@/commands/suggestions';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

const EXAMPLE_PROMPTS = [
  { label: 'Exposure % USD', text: "What's my % exposure to USD?" },
  { label: 'Buy $10k AAPL', text: 'Buy $10k AAPL' },
  { label: 'Add $2k cash', text: 'Add $2k cash' },
];

const EXTRA_AUTOCOMPLETE = [
  'Cash breakdown by currency',
  'Exposure by chain',
  'Equity exposure',
  'Allocation by category',
  'Price overrides',
  'Account health',
  'Unrealized PnL',
  'Risk concentration',
  'Perps utilization',
  'Largest debts',
  'Missing prices',
  'Recent changes',
];

const DISCOVERY_GROUPS = [
  {
    id: 'exposure',
    title: 'Exposure',
    description: 'See risk, currency, and custody splits.',
    accent: '#00C2A8',
    commands: [
      { label: 'USD Exposure', text: "What's my exposure to USD?" },
      { label: 'Stablecoin Exposure', text: 'Stablecoin exposure' },
      { label: 'By Custody', text: 'Exposure by custody' },
    ],
  },
  {
    id: 'performance',
    title: 'Performance',
    description: 'Spot momentum and recent swings.',
    accent: '#F4A261',
    commands: [
      { label: 'Top Gainers', text: 'Top gainers 24h' },
      { label: 'Top Losers', text: 'Top losers 24h' },
      { label: 'Recent Changes', text: 'Recent changes' },
    ],
  },
  {
    id: 'risk',
    title: 'Risk',
    description: 'Concentration, debt, and leverage.',
    accent: '#E76F51',
    commands: [
      { label: 'Risk Concentration', text: 'Risk concentration' },
      { label: 'Largest Debts', text: 'Largest debts' },
      { label: 'Perps Utilization', text: 'Perps utilization' },
    ],
  },
  {
    id: 'hygiene',
    title: 'Hygiene',
    description: 'Find gaps and manual overrides.',
    accent: '#6C8AE4',
    commands: [
      { label: 'Missing Prices', text: 'Positions missing prices' },
      { label: 'Price Overrides', text: 'Price overrides' },
      { label: 'Account Health', text: 'Account health' },
    ],
  },
  {
    id: 'strategy',
    title: 'Strategy',
    description: 'Allocation and rebalance ideas.',
    accent: '#2A9D8F',
    commands: [
      { label: 'Cash vs Invested', text: 'Cash vs invested' },
      { label: 'Allocation by Category', text: 'Allocation by category' },
      { label: 'Rebalance Targets', text: 'Rebalance to crypto=50, equities=30, cash=20' },
    ],
  },
];

export default function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const {
    setText,
    mode,
    isLoading,
    loadingText,
    queryResult,
    llmResponse,
    successMessage,
    error,
    submitText,
    cancelMutation,
    clearError,
    reset,
    pendingAction,
    setPendingAction,
  } = useCommandPalette();

  // Store data for the confirmation modal
  const positions = usePortfolioStore(s => s.positions);
  const prices = usePortfolioStore(s => s.prices);
  const customPrices = usePortfolioStore(s => s.customPrices);
  const fxRates = usePortfolioStore(s => s.fxRates);
  const positionsWithPrices = useMemo(
    () => calculateAllPositionsWithPrices(positions, prices, customPrices, fxRates),
    [positions, prices, customPrices, fxRates]
  );

  const inputRef = useRef<HTMLInputElement>(null);
  const errorTimerRef = useRef<NodeJS.Timeout | null>(null);
  const successTimerRef = useRef<NodeJS.Timeout | null>(null);
  const closingRef = useRef(false);
  const [closing, setClosing] = useState(false);

  // cmdk search state (separate from `text` which is the value sent to LLM)
  const [search, setSearch] = useState('');
  const pathname = usePathname();

  const suggestionGroups = useMemo(() => getSuggestions(pathname), [pathname]);
  const suggestionItems = useMemo(
    () => suggestionGroups.flatMap((group) => group.items),
    [suggestionGroups]
  );

  const animateClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    setTimeout(() => {
      closingRef.current = false;
      setClosing(false);
      reset();
      setSearch('');
      onClose();
    }, 150);
  }, [onClose, reset]);

  // Auto-focus on open
  useEffect(() => {
    if (isOpen) {
      reset();
      closingRef.current = false;
      setSearch('');
      setClosing(false);
      // Defer focus to next frame to ensure DOM is ready
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen, reset]);

  // When pendingAction is set, close the palette without resetting pendingAction
  useEffect(() => {
    if (pendingAction && isOpen) {
      if (closingRef.current) return;
      closingRef.current = true;
      // Defer setState to avoid synchronous setState in effect
      setTimeout(() => {
        setClosing(true);
        setTimeout(() => {
          closingRef.current = false;
          setClosing(false);
          onClose();
        }, 150);
      }, 0);
    }
  }, [pendingAction]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (llmResponse) {
          cancelMutation();
          reset();
          setSearch('');
          setTimeout(() => inputRef.current?.focus(), 50);
        } else {
          animateClose();
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, animateClose, llmResponse, cancelMutation, reset]);

  // Auto-dismiss error after 5s
  useEffect(() => {
    if (error) {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      errorTimerRef.current = setTimeout(() => clearError(), 5000);
    }
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, [error, clearError]);

  // Auto-close on success after 1.2s
  useEffect(() => {
    if (successMessage) {
      successTimerRef.current = setTimeout(() => {
        animateClose();
      }, 1200);
    }
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, [successMessage, animateClose]);

  // Handle selecting a suggestion
  const handleSuggestionSelect = useCallback((suggestionText: string, mode: 'insert' | 'submit' = 'submit') => {
    if (isPartialCommand(suggestionText) || mode === 'insert') {
      // Partial command: fill input, let user type the rest
      setText(suggestionText);
      setSearch(suggestionText);
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      // Full command: send directly to LLM
      setText(suggestionText);
      setSearch('');
      submitText(suggestionText);
    }
  }, [setText, submitText]);

  const autoCompleteCandidates = useMemo(() => {
    const base = [
      ...EXAMPLE_PROMPTS.map((p) => p.text),
      ...DISCOVERY_GROUPS.flatMap((group) => group.commands.map((c) => c.text)),
      ...suggestionItems.map((item) => item.text),
      ...EXTRA_AUTOCOMPLETE,
    ];
    return Array.from(new Set(base.filter(Boolean)));
  }, [suggestionItems]);

  const rankSuggestions = useCallback((input: string) => {
    const query = input.trim().toLowerCase();
    if (!query) return [];

    const queryTokens = query.split(/\s+/).filter(Boolean);
    const queryCompact = query.replace(/\s+/g, '');

    const scoreMatch = (candidate: string) => {
      const target = candidate.toLowerCase();
      if (target === query) return 2000;
      if (target.startsWith(query)) return 1500 - (target.length - query.length);
      const idx = target.indexOf(query);
      if (idx >= 0) return 1200 - idx;

      let tokenScore = 0;
      for (const token of queryTokens) {
        if (target.includes(token)) tokenScore += 120;
      }
      if (tokenScore > 0) {
        return 900 + tokenScore - target.length * 0.3;
      }

      const acronym = target
        .split(/\s+/)
        .map((word) => word[0] || '')
        .join('');
      if (acronym.startsWith(queryCompact)) return 700;

      return -1;
    };

    return autoCompleteCandidates
      .map((text) => ({ text, score: scoreMatch(text) }))
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.text);
  }, [autoCompleteCandidates]);

  const rankedSuggestions = useMemo(() => rankSuggestions(search), [rankSuggestions, search]);
  const autoCompleteText = useMemo(() => {
    const prefixMatch = rankedSuggestions.find((cmd) =>
      cmd.toLowerCase().startsWith(search.trim().toLowerCase())
    );
    return prefixMatch || '';
  }, [rankedSuggestions, search]);

  // Handle Enter key in input -- submit to LLM
  // stopPropagation prevents cmdk from also firing onSelect on the highlighted item
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Tab' && autoCompleteText) {
      e.preventDefault();
      setText(autoCompleteText);
      setSearch(autoCompleteText);
      return;
    }
    if (e.key === 'Enter') {
      const currentText = search.trim();
      if (currentText) {
        e.preventDefault();
        e.stopPropagation();
        setText(currentText);
        submitText(currentText);
      }
    }
  }, [autoCompleteText, search, setSearch, setText, submitText]);

  const handleBackdropClick = () => {
    if (!isLoading) animateClose();
  };

  const showCommands = mode === 'commands' || mode === 'error';
  const showExamples = showCommands && !search && !isLoading && !queryResult && !llmResponse;
  const inputDisabled = isLoading || !!queryResult || !!llmResponse;

  const showAutocomplete = !!autoCompleteText &&
    !inputDisabled &&
    autoCompleteText.toLowerCase() !== search.toLowerCase();
  const smartSuggestions = rankedSuggestions.slice(0, 5);
  const showSmartSuggestions = !!search && smartSuggestions.length > 0 && !queryResult && !llmResponse;

  // When palette is closed but pendingAction exists, render only the modal
  if (!isOpen) {
    if (pendingAction) {
      return (
        <ConfirmPositionActionModal
          isOpen={!!pendingAction}
          onClose={() => { setPendingAction(null); }}
          parsedAction={pendingAction}
          positions={positions}
          positionsWithPrices={positionsWithPrices}
        />
      );
    }
    return null;
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`command-palette-backdrop ${closing ? 'closing' : ''}`}
        onClick={handleBackdropClick}
      />

      {/* Panel */}
      <div className="command-palette">
        <div
          className={`command-palette-panel ${closing ? 'closing' : ''}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Success state */}
          {successMessage ? (
            <div className="command-palette-success px-4 py-4 flex items-center gap-3">
              <div className="w-5 h-5 flex items-center justify-center">
                <Check className="w-5 h-5 text-[var(--positive)]" />
              </div>
              <span className="text-sm text-[var(--positive)]">
                {successMessage}
              </span>
            </div>
          ) : (
            <Command
              label="Command palette"
              shouldFilter={false}
              loop
            >
              {/* Input row */}
              <div className="relative">
                <MessageSquare
                  className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors z-10 ${
                    search
                      ? 'text-[var(--foreground-muted)]'
                      : 'text-[var(--foreground-subtle)]'
                  }`}
                />
                {showAutocomplete && (
                  <div className="cmdk-autocomplete" aria-hidden="true">
                    <span className="cmdk-autocomplete-prefix">{search}</span>
                    <span className="cmdk-autocomplete-suffix">
                      {autoCompleteText.slice(search.length)}
                    </span>
                    <span className="cmdk-autocomplete-hint">Tab</span>
                  </div>
                )}
                <Command.Input
                  ref={inputRef}
                  value={search}
                  onValueChange={(v) => {
                    setSearch(v);
                    if (error) clearError();
                    if (llmResponse) {
                      cancelMutation();
                      reset();
                    }
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything about your portfolio..."
                  className={`command-palette-input ${isLoading ? 'opacity-50' : ''}`}
                  disabled={inputDisabled}
                />
                {/* Right side: shortcut badge or clear button */}
                {search && !isLoading && !queryResult && !llmResponse ? (
                  <button
                    onClick={() => {
                      setSearch('');
                      setText('');
                      clearError();
                      inputRef.current?.focus();
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-[var(--background-secondary)] transition-colors z-10"
                  >
                    <X className="w-4 h-4 text-[var(--foreground-muted)]" />
                  </button>
                ) : !isLoading && !queryResult && !llmResponse ? (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[var(--foreground-subtle)] px-1.5 py-0.5 border border-[var(--border)] z-10">
                    {typeof navigator !== 'undefined' &&
                    /Mac/i.test(navigator.userAgent)
                      ? '\u2318'
                      : 'Ctrl+'}
                    K
                  </span>
                ) : null}
              </div>

              {showSmartSuggestions && (
                <div className="cmdk-smart-suggestions">
                  <span className="cmdk-smart-label">Suggestions</span>
                  {smartSuggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="cmdk-smart-chip"
                      onClick={() => handleSuggestionSelect(suggestion, 'insert')}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}

              {showExamples && (
                <>
                  <div className="cmdk-examples">
                    <span className="cmdk-examples-label">Try</span>
                    {EXAMPLE_PROMPTS.map((example) => (
                      <button
                        key={example.label}
                        type="button"
                        className="cmdk-example-chip"
                        onClick={() => handleSuggestionSelect(example.text)}
                      >
                        {example.label}
                      </button>
                    ))}
                  </div>
                  <div className="cmdk-discovery">
                    <div className="cmdk-discovery-header">
                      <div>
                        <p className="cmdk-discovery-title">Explore</p>
                        <p className="cmdk-discovery-subtitle">Smart categories to unlock more commands</p>
                      </div>
                      <span className="cmdk-discovery-hint">Click to insert</span>
                    </div>
                    <div className="cmdk-discovery-grid">
                      {DISCOVERY_GROUPS.map((group) => (
                        <div
                          key={group.id}
                          className="cmdk-discovery-card"
                          style={{ ['--cmdk-accent' as string]: group.accent }}
                        >
                          <div className="cmdk-discovery-card-top">
                            <span className="cmdk-discovery-card-title">{group.title}</span>
                            <span className="cmdk-discovery-card-tag">Smart</span>
                          </div>
                          <p className="cmdk-discovery-card-desc">{group.description}</p>
                          <div className="cmdk-discovery-chips">
                            {group.commands.map((command) => (
                              <button
                                key={command.label}
                                type="button"
                                className="cmdk-discovery-chip"
                                onClick={() => handleSuggestionSelect(command.text, 'insert')}
                              >
                                {command.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Loading shimmer + command echo */}
              {isLoading && (
                <>
                  <div className="command-palette-shimmer">
                    <div className="command-palette-shimmer-bar" />
                  </div>
                  {loadingText && (
                    <div className="px-4 py-2 text-[13px] text-[var(--foreground-muted)] italic">
                      &ldquo;{loadingText}&rdquo;
                    </div>
                  )}
                </>
              )}

              {/* Query result */}
              {queryResult && (
                <div>
                  <QueryResultView result={queryResult} />
                  <div className="px-4 py-2 flex justify-end">
                    <button
                      onClick={() => {
                        reset();
                        setSearch('');
                        setTimeout(() => inputRef.current?.focus(), 50);
                      }}
                      className="text-[13px] text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
                    >
                      Ask another question
                    </button>
                  </div>
                </div>
              )}

              {/* LLM response */}
              {llmResponse && (
                <div className="border-t border-[var(--border)]">
                  <div className="px-4 py-3 text-[13px] text-[var(--foreground)] whitespace-pre-wrap leading-relaxed">
                    {llmResponse}
                  </div>
                  <div className="px-4 py-2 flex justify-end border-t border-[var(--border)]">
                    <button
                      onClick={() => {
                        reset();
                        setSearch('');
                        setTimeout(() => inputRef.current?.focus(), 50);
                      }}
                      className="text-[13px] text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
                    >
                      Ask another question
                    </button>
                  </div>
                </div>
              )}

              {/* Error bar */}
              {error && (
                <div className="px-4 py-3 bg-[var(--negative-light)] border-t border-[rgba(201,123,123,0.2)] flex items-start gap-2 text-[13px] text-[var(--negative)]">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <span>{error}</span>
                    {error.includes('Ollama') && (
                      <Link
                        href="/settings"
                        onClick={animateClose}
                        className="ml-2 inline-flex items-center gap-1 text-[var(--accent-primary)] hover:underline"
                      >
                        <Settings className="w-3 h-3" />
                        Settings
                      </Link>
                    )}
                  </div>
                  <button
                    onClick={clearError}
                    className="p-0.5 hover:bg-[var(--background-secondary)] transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}

              {showCommands && !showExamples && (
                <div className="px-4 py-6 text-center text-[13px] text-[var(--foreground-muted)]">
                  Press Enter to send to AI
                </div>
              )}
            </Command>
          )}
        </div>
      </div>
    </>
  );
}
