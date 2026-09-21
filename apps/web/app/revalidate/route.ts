import { revalidateTag } from "next/cache";
import type { NextRequest } from "next/server";

/** Chamado pela API depois de cada importação: o site passa a mostrar os novos resultados na hora. */
export async function POST(request: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ revalidated: false }, { status: 401 });
  }
  revalidateTag("rkr", { expire: 0 });
  return Response.json({ revalidated: true, now: Date.now() });
}
