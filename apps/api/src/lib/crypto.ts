import { createHash, randomUUID } from "node:crypto";


export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function newJti(): string {
  return randomUUID();
}
