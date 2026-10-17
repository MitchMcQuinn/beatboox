import type { ReactNode } from 'react'

export function Panel({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-md border border-line bg-panel ${className}`}>
      <header className="border-b border-line px-3 py-2 text-[11px] tracking-[0.16em] text-muted uppercase">
        {title}
      </header>
      <div className="p-3">{children}</div>
    </section>
  )
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  display?: string
}) {
  return (
    <label className="block text-xs text-muted">
      <span className="mb-1 flex items-center justify-between gap-3">
        <span>{label}</span>
        <span className="font-mono text-ink">{display ?? value}</span>
      </span>
      <input
        className="w-full"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

export function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string | number
  onChange: (value: string) => void
  children: ReactNode
}) {
  return (
    <label className="block text-xs text-muted">
      <span className="mb-1 block">{label}</span>
      <select className="w-full" value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  )
}
