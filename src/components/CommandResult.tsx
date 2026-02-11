'use client';

import { QueryResult, MutationPreview } from '@/services/domain/command-types';
import { usePortfolioStore } from '@/store/portfolioStore';

// ─── Query Result Renderer ──────────────────────────────────────────────────

function QueryMetric({ result }: { result: QueryResult }) {
  const hideBalances = usePortfolioStore((s) => s.hideBalances);
  const mask = (v: string) => (hideBalances ? '••••' : v);

  return (
    <div className="border-t border-[var(--border)] px-4 py-3 space-y-1">
      <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)]">
        {result.title}
      </p>
      <p className="text-xl font-semibold">{mask(result.value || '')}</p>
      {result.subtitle && (
        <p className="text-xs text-[var(--foreground-muted)]">
          {mask(result.subtitle)}
        </p>
      )}
    </div>
  );
}

function QueryTable({ result }: { result: QueryResult }) {
  const hideBalances = usePortfolioStore((s) => s.hideBalances);
  const mask = (v: string) => (hideBalances ? '••••' : v);
  const rows = result.rows || [];

  return (
    <div className="border-t border-[var(--border)] px-4 py-3 space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)]">
        {result.title}
      </p>
      {result.subtitle && (
        <p className="text-xs text-[var(--foreground-muted)] mb-1">
          {result.subtitle}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="text-[13px] text-[var(--foreground-muted)] italic">
          No data
        </p>
      ) : (
        <div className="space-y-1 max-h-[280px] overflow-y-auto">
          {rows.map((row, i) => {
            const colorClass =
              row.color === 'positive'
                ? 'text-[var(--positive)]'
                : row.color === 'negative'
                  ? 'text-[var(--negative)]'
                  : '';

            return (
              <div
                key={i}
                className="flex items-center justify-between text-[13px] py-0.5"
              >
                <span className={`font-medium ${colorClass}`}>
                  {row.label}
                </span>
                <div className="flex gap-3 font-mono text-[13px]">
                  {row.values.map((v, vi) => (
                    <span
                      key={vi}
                      className={vi === 0 ? colorClass : 'text-[var(--foreground-muted)]'}
                    >
                      {mask(v)}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function QueryResultView({ result }: { result: QueryResult }) {
  if (result.format === 'metric') {
    return <QueryMetric result={result} />;
  }
  return <QueryTable result={result} />;
}

// ─── Mutation Preview Renderer ──────────────────────────────────────────────

interface MutationPreviewProps {
  preview: MutationPreview;
  onConfirm: () => void;
  onCancel: () => void;
}

export function MutationPreviewView({
  preview,
  onConfirm,
  onCancel,
}: MutationPreviewProps) {
  const hideBalances = usePortfolioStore((s) => s.hideBalances);
  const mask = (v: string) => (hideBalances ? '••••' : v);
  const isError = !!preview.resolvedArgs._error;

  return (
    <div className="border-t border-[var(--border)] px-4 py-3 space-y-3">
      <p className="text-[10px] uppercase tracking-wider text-[var(--foreground-muted)]">
        {isError ? 'ERROR' : 'CONFIRM'}
      </p>
      <p className="text-[13px] font-medium">{preview.summary}</p>
      <div className="space-y-1">
        {preview.changes.map((change, i) => (
          <div
            key={i}
            className="flex items-center justify-between text-[13px]"
          >
            <span className="text-[var(--foreground-muted)]">
              {change.label}
            </span>
            <div className="font-mono text-[13px]">
              {change.before && (
                <>
                  <span>{mask(change.before)}</span>
                  <span className="text-[var(--foreground-muted)] mx-2">
                    &rarr;
                  </span>
                </>
              )}
              <span>{mask(change.after)}</span>
            </div>
          </div>
        ))}
      </div>
      {!isError && (
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="btn btn-secondary flex-1 text-[13px]"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="btn btn-primary flex-1 text-[13px]"
          >
            Confirm
          </button>
        </div>
      )}
    </div>
  );
}
