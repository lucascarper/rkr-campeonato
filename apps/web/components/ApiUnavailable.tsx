export function ApiUnavailable() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-24 text-center">
      <p className="eyebrow">Sem conexão com os dados</p>
      <h1 className="display mt-3 text-4xl font-extrabold">Classificação indisponível no momento</h1>
      <p className="mt-3 text-muted">
        O serviço de resultados não respondeu. Atualize a página em alguns instantes.
      </p>
    </div>
  );
}
