import type { CategoryCode } from "./types";

export const CATEGORIES: CategoryCode[] = ["RK1", "RK2", "RK3"];

export function parseCategory(value: string | undefined): CategoryCode | null {
  const code = (value ?? "").toUpperCase();
  return (CATEGORIES as string[]).includes(code) ? (code as CategoryCode) : null;
}
