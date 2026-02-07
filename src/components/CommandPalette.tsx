'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquare, X, AlertCircle, Settings } from 'lucide-react';
import Link from 'next/link';
import { ParsedPositionAction, Position } from '@/types';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onParsed: (action: ParsedPositionAction) => void;
  positions: Position[];
}

const EXAMPLES = [
  'Bought 10 AAPL at $185',
  'Sold half of my ETH',
  'Closed TSLA position at $420',
];

export default function CommandPalette({
  isOpen,
  onClose,
  onParsed,
  positions,
}: CommandPaletteProps) {
  const [text, setText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const errorTimerRef = useRef<NodeJS.Timeout | null>(null);

  const animateClose = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      onClose();
    }, 150);
  }, [onClose]);

  // Auto-focus on open
  useEffect(() => {
    if (isOpen) {
      setText('');
      setError(null);
      setIsLoading(false);
      setClosing(false);
      // Small delay to ensure DOM is ready
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        animateClose();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, animateClose]);

  // Auto-dismiss error after 5s
  useEffect(() => {
    if (error) {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      errorTimerRef.current = setTimeout(() => setError(null), 5000);
    }
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, [error]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!text.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const ollamaUrl =
        (typeof window !== 'undefined' &&
          localStorage.getItem('ollama_url')) ||
        'http://localhost:11434';
      const ollamaModel =
        (typeof window !== 'undefined' &&
          localStorage.getItem('ollama_model')) ||
        'llama3.2';

      // Deduplicate wallet positions by symbol
      const seenWalletSymbols = new Set<string>();
      const deduplicatedPositions = positions.filter((p) => {
        if (!p.walletAddress) return true;
        const key = p.symbol.toUpperCase();
        if (seenWalletSymbols.has(key)) return false;
        seenWalletSymbols.add(key);
        return true;
      });

      const positionContext = deduplicatedPositions.map((p) => ({
        id: p.id,
        symbol: p.symbol,
        name: p.name,
        type: p.type,
        amount: p.amount,
        costBasis: p.costBasis,
      }));

      const response = await fetch('/api/parse-position', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          positions: positionContext,
          ollamaUrl,
          ollamaModel,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to parse command');
      }

      onParsed(data as ParsedPositionAction);
      setText('');
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
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleBackdropClick = () => {
    if (!isLoading) animateClose();
  };

  const showExamples = !text && !isLoading;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`command-palette-backdrop ${closing ? 'closing' : ''}`}
        onClick={handleBackdropClick}
      />

      {/* Panel */}
      <div className="command-palette" onClick={handleBackdropClick}>
        <div
          className={`command-palette-panel ${closing ? 'closing' : ''}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Input row */}
          <div className="relative">
            <MessageSquare
              className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors ${
                text ? 'text-[var(--foreground-muted)]' : 'text-[var(--foreground-subtle)]'
              }`}
            />
            <input
              ref={inputRef}
              type="text"
              value={isLoading ? '' : text}
              onChange={(e) => {
                setText(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={handleKeyDown}
              placeholder={isLoading ? 'Parsing...' : 'Record a trade...'}
              className="command-palette-input"
              disabled={isLoading}
            />
            {/* Right side: shortcut badge or clear button */}
            {text && !isLoading ? (
              <button
                onClick={() => {
                  setText('');
                  setError(null);
                  inputRef.current?.focus();
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-[var(--background-secondary)] transition-colors"
              >
                <X className="w-4 h-4 text-[var(--foreground-muted)]" />
              </button>
            ) : !isLoading ? (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[var(--foreground-subtle)] px-1.5 py-0.5 border border-[var(--border)]">
                {typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent) ? '⌘' : 'Ctrl+'}K
              </span>
            ) : null}
          </div>

          {/* Loading shimmer */}
          {isLoading && (
            <div className="command-palette-shimmer">
              <div className="command-palette-shimmer-bar" />
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
                onClick={() => setError(null)}
                className="p-0.5 hover:bg-[var(--background-secondary)] transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Examples section */}
          {showExamples && (
            <div className="border-t border-[var(--border)] px-4 py-3">
              <div className="space-y-1.5">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    onClick={() => {
                      setText(example);
                      inputRef.current?.focus();
                    }}
                    className="flex items-center gap-2 w-full text-left text-[13px] text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors py-0.5"
                  >
                    <span className="text-[var(--foreground-subtle)]">·</span>
                    <span>&ldquo;{example}&rdquo;</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
