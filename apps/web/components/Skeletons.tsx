/** Esqueletos de carregamento no formato de cada tela (no lugar de um texto "carregando"). */

function Block({ className }: { className: string }) {
  return <div className={`bg-surface-2 ${className}`} />;
}

function Title() {
  return (
    <div className="flex flex-col gap-3">
      <Block className="h-3 w-48" />
      <Block className="h-10 w-72 sm:h-16 sm:w-[28rem]" />
      <Block className="h-3 w-56" />
    </div>
  );
}

export function StandingsSkeleton() {
  return (
    <div
      className="mx-auto max-w-7xl animate-pulse px-4 pb-20 pt-4 sm:pt-10"
      role="status"
      aria-label="Carregando classificação"
    >
      <Title />
      <div className="mt-6 flex gap-1.5">
        {Array.from({ length: 8 }, (_, i) => (
          <Block key={i} className="cut-sm h-10 w-12" />
        ))}
      </div>
      <div className="mt-6 grid grid-cols-3 items-end gap-2 sm:gap-3 lg:max-w-4xl">
        <Block className="cut-sm h-[8rem] sm:h-[12.5rem]" />
        <Block className="cut-sm h-[9.5rem] sm:h-[15rem]" />
        <Block className="cut-sm h-[8rem] sm:h-[12.5rem]" />
      </div>
      <div className="panel cut mt-6">
        {Array.from({ length: 10 }, (_, i) => (
          <div
            key={i}
            className="flex h-[3.25rem] items-center gap-3 border-b border-line px-3 last:border-b-0"
          >
            <Block className="h-6 w-6" />
            <Block className="cut-sm h-8 w-8" />
            <Block className="h-3 w-40" />
            <Block className="ml-auto h-4 w-10" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div
      className="mx-auto max-w-7xl animate-pulse px-4 pb-20 pt-4 sm:pt-10"
      role="status"
      aria-label="Carregando dashboard"
    >
      <Title />
      <div className="mt-8 grid grid-cols-2 gap-px lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Block key={i} className="h-[7.5rem]" />
        ))}
      </div>
      <div className="mt-8 grid gap-px sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex flex-col gap-3 bg-surface p-5">
            <Block className="h-3 w-32" />
            <Block className="h-12 w-20" />
            <Block className="h-4 w-36" />
            {Array.from({ length: 5 }, (_, j) => (
              <Block key={j} className="h-2 w-full" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CalendarSkeleton() {
  return (
    <div
      className="mx-auto max-w-4xl animate-pulse px-4 pb-20 pt-4 sm:pt-10"
      role="status"
      aria-label="Carregando calendário"
    >
      <Block className="h-10 w-72 sm:h-16" />
      <div className="mt-8 flex flex-col gap-6 border-l border-line-strong pl-5 sm:pl-8">
        {Array.from({ length: 6 }, (_, i) => (
          <Block key={i} className="cut h-24" />
        ))}
      </div>
    </div>
  );
}
