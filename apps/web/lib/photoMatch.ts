/** Associa arquivos de foto a pilotos pelo nome do arquivo (ex.: "joao-vitor-buzin.jpg", "Buzin.png"). */

export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,5}$/, "") // extensão
    .replace(/["'()]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Devolve o id do piloto que corresponde ao arquivo, ou null se não houver um único candidato.
 * Ordem: nome completo igual; depois todas as palavras do arquivo presentes no nome do piloto.
 */
export function matchDriver<T extends { id: number; name: string; slug: string }>(
  filename: string,
  drivers: T[],
): T | null {
  const file = normalize(filename);
  if (!file) return null;
  const exact = drivers.filter((d) => normalize(d.name) === file || d.slug.replace(/-/g, " ") === file);
  if (exact.length === 1) return exact[0];
  const words = file.split(" ").filter((w) => w.length > 1 && !/^\d+$/.test(w));
  if (!words.length) return null;
  const partial = drivers.filter((d) => {
    const nameWords = normalize(d.name).split(" ");
    return words.every((w) => nameWords.includes(w));
  });
  return partial.length === 1 ? partial[0] : null;
}
