type StepHeaderProps = {
  id?: string | undefined
  eyebrow?: string | undefined
  title: string
  description?: string | undefined
}

export function StepHeader({ id, eyebrow, title, description }: StepHeaderProps) {
  return (
    <header className="mb-7">
      {eyebrow ? (
        <p className="mb-2 text-xs font-bold tracking-[0.12em] text-muted uppercase">{eyebrow}</p>
      ) : null}
      <h1
        id={id}
        className="max-w-xl text-3xl leading-tight font-semibold tracking-[-0.035em] text-ink sm:text-4xl"
      >
        {title}
      </h1>
      {description ? <p className="mt-3 max-w-xl leading-7 text-muted">{description}</p> : null}
    </header>
  )
}
