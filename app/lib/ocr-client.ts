import type { PaddleItem } from "./banknote-scan";

type Result = Array<{ items: PaddleItem[] }>;

// Keep the SDK and OpenCV imports out of the page: their generated functions
// belong in the worker's restricted execution context.
export async function createOcrWorker() {
  const worker = new Worker(new URL("../workers/ocr.ts", import.meta.url), { type: "module" });
  let sequence = 0;
  let closed = false;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  const failAll = (error: Error) => {
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error); }
    pending.clear();
  };
  worker.onmessage = (event) => {
    const message = event.data;
    if (message?.kind !== "worker-transport-response") return;
    const request = pending.get(message.requestId);
    if (!request) return;
    clearTimeout(request.timer);
    pending.delete(message.requestId);
    if (message.status === "success") request.resolve(message.payload);
    else request.reject(new Error(message.error?.message || "Recognition failed. Retry the scan."));
  };
  worker.onerror = () => failAll(new Error("Recognition worker could not start. Reload and try again, or enter the codes manually."));
  const request = (type: string, payload: unknown) => new Promise<unknown>((resolve, reject) => {
    if (closed) return reject(new Error("Recognition worker is closed."));
    const requestId = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error("Recognition timed out. Check your connection, then retry."));
    }, type === "init" ? 60000 : 30000);
    pending.set(requestId, { resolve, reject, timer });
    try { worker.postMessage({ kind: "worker-transport-request", type, payload, requestId }); }
    catch { clearTimeout(timer); pending.delete(requestId); reject(new Error("Could not send the captured frame to recognition.")); }
  });
  const dispose = async () => {
    closed = true;
    worker.terminate();
    failAll(new Error("Recognition worker was closed."));
  };
  try { await request("init", {}); }
  catch (error) { await dispose(); throw error; }
  return {
    predict: (source: Blob, params?: Record<string, number>) => request("predict", { sources: [source], params }) as Promise<Result>,
    dispose,
  };
}
