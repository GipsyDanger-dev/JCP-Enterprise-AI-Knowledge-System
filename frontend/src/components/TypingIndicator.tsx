interface TypingIndicatorProps {
  name: string
}

export function TypingIndicator({ name }: TypingIndicatorProps) {
  return (
    <div className="typing-indicator-wrap">
      <div className="typing-indicator-dots">
        <span /><span /><span />
      </div>
      <small>{name} sedang mengetik…</small>
    </div>
  )
}
