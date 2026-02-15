'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Command } from 'cmdk';
import { MessageSquare, X, AlertCircle, Settings, Check, CornerDownLeft } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCommandPalette } from '@/hooks/useCommandPalette';
import { QueryResultView } from '@/components/CommandResult';
import { usePortfolioStore } from '@/store/portfolioStore';
import { calculateAllPositionsWithPrices } from '@/services/domain/portfolio-calculator';
import ConfirmPositionActionModal from '@/components/modals/ConfirmPositionActionModal';
import { getSuggestions, isPartialCommand } from '@/commands/suggestions';
import { formatDistanceToNow } from 'date-fns';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

const EXAMPLE_PROMPTS = [
  { label: 'Exposure % USD', text: "What's my % exposure to USD?" },
  { label: 'Buy $10k AAPL', text: 'Buy $10k AAPL' },
  { label: 'Add $2k cash', text: 'Add $2k cash' },
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
    recentCommands,
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

  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement>(null);
  const errorTimerRef = useRef<NodeJS.Timeout | null>(null);
  const successTimerRef = useRef<NodeJS.Timeout | null>(null);
  const closingRef = useRef(false);
  const [closing, setClosing] = useState(false);

  // cmdk search state (separate from `text` which is the value sent to LLM)
  const [search, setSearch] = useState('');

  const suggestionGroups = useMemo(() => getSuggestions(pathname), [pathname]);
  const recentEntries = useMemo(() => recentCommands.slice(0, 3), [recentCommands]);

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
  const handleSuggestionSelect = useCallback((suggestionText: string) => {
    if (isPartialCommand(suggestionText)) {
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

  // Handle recent command selection
  const handleRecentSelect = useCallback((commandText: string) => {
    setText(commandText);
    setSearch('');
    submitText(commandText);
  }, [setText, submitText]);

  // Handle Enter key in input -- submit to LLM
  // stopPropagation prevents cmdk from also firing onSelect on the highlighted item
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const currentText = search.trim();
      if (currentText) {
        e.preventDefault();
        e.stopPropagation();
        setText(currentText);
        submitText(currentText);
      }
    }
  }, [search, setText, submitText]);

  const handleBackdropClick = () => {
    if (!isLoading) animateClose();
  };

  const showSuggestions = mode === 'commands' || mode === 'error';
  const showExamples = showSuggestions && !search && !isLoading && !queryResult && !llmResponse;
  const inputDisabled = isLoading || !!queryResult || !!llmResponse;

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
              shouldFilter={showSuggestions}
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

              {showExamples && (
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

              {/* Suggestion list */}
              {showSuggestions && (
                <Command.List>
                  {/* Recent commands */}
                  {recentEntries.length > 0 && (
                    <Command.Group heading="RECENT">
                      {recentEntries.map((entry) => (
                        <Command.Item
                          key={`recent-${entry.timestamp}`}
                          value={`recent: ${entry.text}`}
                          keywords={[entry.text]}
                          onSelect={() => handleRecentSelect(entry.text)}
                        >
                          <CornerDownLeft className="w-4 h-4 text-[var(--foreground-subtle)] flex-shrink-0" />
                          <span className="flex-1 truncate">{entry.text}</span>
                          <span className="text-[11px] text-[var(--foreground-subtle)] flex-shrink-0">
                            {formatDistanceToNow(
                              new Date(entry.timestamp),
                              { addSuffix: false }
                            )}
                          </span>
                        </Command.Item>
                      ))}
                    </Command.Group>
                  )}

                  {/* Suggestion categories */}
                  {suggestionGroups.map((group) => (
                    <Command.Group key={group.category} heading={group.category}>
                      {group.items.map((item) => {
                        const IconComponent = item.icon;
                        return (
                          <Command.Item
                            key={item.id}
                            value={item.label}
                            keywords={[...item.keywords, item.text]}
                            onSelect={() => handleSuggestionSelect(item.text)}
                          >
                            <IconComponent className="w-4 h-4 flex-shrink-0" />
                            <span className="flex-1">{item.label}</span>
                            <span className="cmdk-category-tag">{item.category}</span>
                          </Command.Item>
                        );
                      })}
                    </Command.Group>
                  ))}

                  <Command.Empty className="px-4 py-6 text-center text-[13px] text-[var(--foreground-muted)]">
                    Press Enter to send to AI
                  </Command.Empty>
                </Command.List>
              )}
            </Command>
          )}
        </div>
      </div>
    </>
  );
}
