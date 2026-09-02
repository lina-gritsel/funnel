import { StepHeader } from '../StepHeader'

type InfoStepProps = {
  title: string
  body: string
}

export function InfoStep({ title, body }: InfoStepProps) {
  return <StepHeader eyebrow="Перед началом" title={title} description={body} />
}
