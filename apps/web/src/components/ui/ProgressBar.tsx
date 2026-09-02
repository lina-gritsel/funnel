type ProgressBarProps = {
  current: number
  total: number
}

export function ProgressBar({ current, total }: ProgressBarProps) {
  const safeTotal = Math.max(total, 1)
  const safeCurrent = Math.min(Math.max(current, 0), safeTotal)
  const percentage = (safeCurrent / safeTotal) * 100

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm text-muted">
        <span>Прогресс</span>
        <span>
          {safeCurrent} из {safeTotal}
        </span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-accent-soft"
        role="progressbar"
        aria-label="Прогресс прохождения"
        aria-valuemin={0}
        aria-valuemax={safeTotal}
        aria-valuenow={safeCurrent}
      >
        <div
          className="h-full rounded-full bg-accent transition-[width]"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}
