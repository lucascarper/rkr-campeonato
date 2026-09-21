export default function Loading() {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center" role="status">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/r-mark.png" alt="" className="h-12 w-12 animate-pulse object-contain opacity-80" />
      <span className="sr-only">Carregando</span>
    </div>
  );
}
