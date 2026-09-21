import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-24 text-center">
      <p className="eyebrow">Erro 404</p>
      <h1 className="display mt-3 text-5xl font-extrabold">Fora da pista</h1>
      <p className="mt-3 text-muted">Esta página não existe. As categorias são RK1, RK2 e RK3.</p>
      <Link href="/" className="cut-sm mt-8 inline-block bg-red px-5 py-3 font-semibold">
        Ver classificação
      </Link>
    </div>
  );
}
