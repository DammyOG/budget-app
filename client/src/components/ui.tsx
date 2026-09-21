import type { ReactNode } from "react";

// Shared building blocks so every page gets the same spacing, tap-target size
// and money formatting on a phone. Before this, each page invented its own
// header and card padding, which is why some pages scrolled for 5,000px and
// others clipped their right-hand columns off the screen.

export function Card({
  children,
  className = "",
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white ${padded ? "p-4" : ""} ${className}`}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold text-slate-900">{children}</h2>
      {action}
    </div>
  );
}

// Page titles were rendering at text-3xl on a 390px screen, wrapping to two
// lines and pushing everything below the fold before any data appeared.
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

type ButtonProps = {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "sm";
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

// min-h-[44px] throughout: the audit found 8–32 controls per page under 40px,
// which is below the size a thumb can reliably hit.
export function Button({ children, variant = "secondary", size = "md", className = "", ...rest }: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none";
  const sizes = {
    md: "min-h-[44px] px-4 text-sm",
    sm: "min-h-[40px] px-3 text-xs",
  };
  const variants = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800",
    secondary: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100",
    ghost: "text-slate-600 hover:bg-slate-100 active:bg-slate-200",
    danger: "border border-red-200 bg-white text-red-600 hover:bg-red-50 active:bg-red-100",
  };
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

// A compact 2-up grid. Six full-width stat cards stacked vertically took over
// 1,000px of scroll on the dashboard for six numbers.
export function StatGrid({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 }) {
  return (
    <div className={`grid gap-3 ${cols === 3 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2"}`}>{children}</div>
  );
}

// Three numbers in a 2-column grid leaves the third orphaned on its own row.
// Sharing one card fits all three across a 390px screen, because they pay for
// the card's padding once instead of three times.
export function StatRow({ items }: { items: { label: string; value: string; tone?: "neutral" | "positive" | "negative" }[] }) {
  return (
    <Card>
      <div className="flex divide-x">
        {items.map((it, i) => (
          <div key={it.label} className={`min-w-0 flex-1 ${i === 0 ? "pr-2" : "px-2"} ${i === items.length - 1 ? "pr-0 pl-2" : ""}`}>
            <div className="truncate text-[11px] font-medium uppercase tracking-wide text-slate-500">{it.label}</div>
            <div
              className={`truncate text-base font-bold tabular-nums ${
                it.tone === "positive"
                  ? "text-emerald-600"
                  : it.tone === "negative"
                  ? "text-red-600"
                  : "text-slate-900"
              }`}
            >
              {it.value}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function Stat({
  label,
  value,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
  hint?: string;
}) {
  const toneClass =
    tone === "positive" ? "text-emerald-600" : tone === "negative" ? "text-red-600" : "text-slate-900";
  return (
    <Card className="min-w-0">
      <div className="truncate text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      {/* tabular-nums keeps columns of figures from jittering as they update. */}
      <div className={`mt-1 truncate text-lg font-bold tabular-nums sm:text-xl ${toneClass}`}>{value}</div>
      {hint ? <div className="mt-0.5 truncate text-xs text-slate-400">{hint}</div> : null}
    </Card>
  );
}

// The single number a page is really about, given room to breathe instead of
// competing with five sibling cards of identical weight.
export function HeroStat({
  label,
  value,
  tone = "neutral",
  children,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
  children?: ReactNode;
}) {
  const toneClass =
    tone === "positive" ? "text-emerald-600" : tone === "negative" ? "text-red-600" : "text-slate-900";
  return (
    <Card className="mb-3">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-3xl font-bold tabular-nums ${toneClass}`}>{value}</div>
      {children}
    </Card>
  );
}

// Replaces rows of individual buttons that wrapped unpredictably. Scrolls
// within itself rather than widening the page.
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className = "",
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={`flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 ${className}`}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-[40px] flex-1 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors ${
            value === o.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 active:bg-slate-200"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// A bottom sheet on phones, a centered dialog on wider screens. Used for
// filters and overflow actions that previously sat in cramped inline rows.
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full flex-col rounded-t-2xl bg-white sm:max-w-md sm:rounded-2xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 active:bg-slate-100"
          >
            ✕
          </button>
        </div>
        {/* pb keeps the last control clear of the home indicator. */}
        <div className="overflow-y-auto px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, hint }: { icon?: string; title: string; hint?: ReactNode }) {
  return (
    <Card className="py-10 text-center">
      {icon ? <div className="mb-2 text-3xl">{icon}</div> : null}
      <p className="font-medium text-slate-700">{title}</p>
      {hint ? <p className="mx-auto mt-1 max-w-xs text-sm text-slate-500">{hint}</p> : null}
    </Card>
  );
}

export function Progress({ pct, over }: { pct: number; over?: boolean }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-200">
      <div
        className={`h-full rounded-full transition-all ${over ? "bg-red-500" : pct > 80 ? "bg-amber-500" : "bg-emerald-500"}`}
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return <div className="py-12 text-center text-sm text-slate-500">{label}</div>;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

// Replaces <input type="month">, which on a phone opens a native wheel picker
// just to step back one month — and rendered as a cramped box that collided
// with the page title.
export function MonthStepper({
  month,
  onChange,
  max,
}: {
  month: string;
  onChange: (m: string) => void;
  max?: string;
}) {
  const atMax = max ? month >= max : false;
  return (
    <div className="flex items-center justify-between rounded-xl bg-white p-1 ring-1 ring-slate-200">
      <button
        onClick={() => onChange(shiftMonth(month, -1))}
        aria-label="Previous month"
        className="flex h-10 w-10 items-center justify-center rounded-lg text-lg text-slate-500 active:bg-slate-100"
      >
        ‹
      </button>
      <span className="text-sm font-medium">{monthLabel(month)}</span>
      <button
        onClick={() => onChange(shiftMonth(month, 1))}
        disabled={atMax}
        aria-label="Next month"
        className="flex h-10 w-10 items-center justify-center rounded-lg text-lg text-slate-500 active:bg-slate-100 disabled:opacity-30"
      >
        ›
      </button>
    </div>
  );
}
