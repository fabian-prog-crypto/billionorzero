'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { MessageSquare, X, AlertCircle, Settings, Check, CornerDownLeft } from 'lucide-react';
import Link from 'next/link';
import { useCommandPalette } from '@/hooks/useCommandPalette';
import { QueryResultView } from '@/components/CommandResult';
import { usePortfolioStore } from '@/store/portfolioStore';
import { calculateAllPositionsWithPrices } from '@/services/domain/portfolio-calculator';
import ConfirmPositionActionModal from '@/components/modals/ConfirmPositionActionModal';
import { formatDistanceToNow } from 'date-fns';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

const EXAMPLE_GROUPS = [
  {
    label: 'TRADE',
    examples: [
      'Bought 10 AAPL at $185',
      'Sold half of my ETH',
    ],
  },
  {
    label: 'CASH',
    examples: [
      '49750 EUR to Revolut',
    ],
  },
  {
    label: 'MANAGE',
    examples: [
      'Remove DOGE',
      'Update BTC amount to 0.6',
    ],
  },
  {
    label: 'QUERY',
    examples: [
      "What's my net worth?",
      'Top 5 positions',
    ],
  },
  {
    label: 'NAVIGATE',
    examples: [
      'Go to performance',
    ],
  },
];

export default function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const {
    text,
    setText,
    isLoading,
    loadingText,
    queryResult,
    llmResponse,
    successMessage,
    error,
    submit,
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

  const inputRef = useRef<HTMLInputElement>(null);
  const errorTimerRef = useRef<NodeJS.Timeout | null>(null);
  const successTimerRef = useRef<NodeJS.Timeout | null>(null);
  const closingRef = useRef(false);
  const [closing, setClosing] = useState(false);

  const animateClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    setTimeout(() => {
      closingRef.current = false;
      setClosing(false);
      reset();
      onClose();
    }, 150);
  }, [onClose, reset]);

  // Auto-focus on open
  useEffect(() => {
    if (isOpen) {
      reset();
      closingRef.current = false;
      // Defer closing state reset to avoid synchronous setState in effect
      setTimeout(() => {
        setClosing(false);
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, reset]);

  // When pendingAction is set, close the palette without resetting pendingAction
  useEffect(() => {
    if (pendingAction && isOpen) {
      if (closingRef.current) return;
      closingRef.current = true;
      setClosing(true);
      setTimeout(() => {
        closingRef.current = false;
        setClosing(false);
        onClose(); // Close palette without calling reset()
      }, 150);
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  const handleBackdropClick = () => {
    if (!isLoading) animateClose();
  };

  const showExamples =
    !text && !isLoading && !queryResult && !llmResponse && !successMessage;
  const inputDisabled = isLoading || !!queryResult || !!llmResponse;

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
            <>
              {/* Input row */}
              <div className="relative">
                <MessageSquare
                  className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors ${
                    text
                      ? 'text-[var(--foreground-muted)]'
                      : 'text-[var(--foreground-subtle)]'
                  }`}
                />
                <input
                  ref={inputRef}
                  type="text"
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
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
                {text && !isLoading && !queryResult && !llmResponse ? (
                  <button
                    onClick={() => {
                      setText('');
                      clearError();
                      inputRef.current?.focus();
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-[var(--background-secondary)] transition-colors"
                  >
                    <X className="w-4 h-4 text-[var(--foreground-muted)]" />
                  </button>
                ) : !isLoading && !queryResult && !llmResponse ? (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[var(--foreground-subtle)] px-1.5 py-0.5 border border-[var(--border)]">
                    {typeof navigator !== 'undefined' &&
                    /Mac/i.test(navigator.userAgent)
                      ? '\u2318'
                      : 'Ctrl+'}
                    K
                  </span>
                ) : null}
              </div>

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

              {/* Examples section (with recent commands) */}
              {showExamples && (
                <div className="border-t border-[var(--border)] px-4 py-3">
                  <div className="space-y-3">
                    {/* Recent commands */}
                    {recentCommands.length > 0 && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">
                          RECENT
                        </p>
                        <div className="space-y-1">
                          {recentCommands.map((entry) => (
                            <button
                              key={entry.timestamp}
                              onClick={() => {
                                setText(entry.text);
                                inputRef.current?.focus();
                              }}
                              className="flex items-center gap-2 w-full text-left text-[13px] text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors py-0.5"
                            >
                              <CornerDownLeft className="w-3 h-3 text-[var(--foreground-subtle)]" />
                              <span className="flex-1 truncate">
                                &ldquo;{entry.text}&rdquo;
                              </span>
                              <span className="text-[11px] text-[var(--foreground-subtle)] flex-shrink-0">
                                {formatDistanceToNow(
                                  new Date(entry.timestamp),
                                  { addSuffix: false }
                                )}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {EXAMPLE_GROUPS.map((group) => (
                      <div key={group.label}>
                        <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)] mb-1">
                          {group.label}
                        </p>
                        <div className="space-y-1">
                          {group.examples.map((example) => (
                            <button
                              key={example}
                              onClick={() => {
                                setText(example);
                                inputRef.current?.focus();
                              }}
                              className="flex items-center gap-2 w-full text-left text-[13px] text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors py-0.5"
                            >
                              <span className="text-[var(--foreground-subtle)]">
                                &middot;
                              </span>
                              <span>&ldquo;{example}&rdquo;</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
