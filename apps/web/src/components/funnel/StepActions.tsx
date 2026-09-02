import { Button } from '../ui/Button'

type StepActionsProps = {
  continueLabel?: string
  onContinue?: () => void
  onBack?: () => void
  disabled?: boolean
  isLoading?: boolean
}

export function StepActions({
  continueLabel = 'Продолжить',
  onContinue,
  onBack,
  disabled,
  isLoading
}: StepActionsProps) {
  return (
    <div className="mt-8 flex items-center justify-between gap-3 border-t border-line pt-5">
      {onBack ? (
        <Button type="button" variant="ghost" disabled={disabled} onClick={onBack}>
          Назад
        </Button>
      ) : (
        <span />
      )}
      <Button type="button" disabled={disabled} isLoading={isLoading} onClick={onContinue}>
        {continueLabel}
      </Button>
    </div>
  )
}
