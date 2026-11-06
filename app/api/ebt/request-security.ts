import { NextRequest } from "next/server";
import { noStoreJson } from "./shared";

export function mutationError(request: NextRequest) {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site" || (origin && origin !== request.nextUrl.origin)) {
    return noStoreJson({ error: "This request must come from the EBT Web app." }, { status: 403 });
  }
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return noStoreJson({ error: "Send an application/json request." }, { status: 415 });
  }
  return null;
}

export async function readJsonObject(request: NextRequest, maxBytes = 65536): Promise<Record<string, unknown>> {
  if (Number(request.headers.get("content-length")) > maxBytes) throw new Error("Request too large");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing body");
  let bytes = 0;
  let text = "";
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) { await reader.cancel(); throw new Error("Request too large"); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally { reader.releaseLock(); }
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected an object");
  return value as Record<string, unknown>;
}
