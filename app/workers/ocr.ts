import { PaddleOCR } from "@paddleocr/paddleocr-js";
import cvModule from "@techstark/opencv-js";

type Request = { requestId: number; type: "init" | "predict"; payload?: { sources?: Blob[]; params?: Record<string, number> } };
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage: (message: unknown) => void;
  location: Location;
};
let engine: Awaited<ReturnType<typeof PaddleOCR.create>> | undefined;
scope.onmessage = async ({ data }) => {
  try {
    let payload: unknown;
    if (data.type === "init") {
      engine = await PaddleOCR.create({
        textDetectionModelName: "PP-OCRv6_tiny_det",
        textRecognitionModelName: "PP-OCRv6_tiny_rec",
        worker: false,
        textDetectionModelAsset: { url: new URL("/ocr/PP-OCRv6_tiny_det_onnx_infer.tar", scope.location.origin).href },
        textRecognitionModelAsset: { url: new URL("/ocr/PP-OCRv6_tiny_rec_onnx_infer.tar", scope.location.origin).href },
        ortOptions: { backend: "wasm", numThreads: 1, simd: true, wasmPaths: new URL("/ocr/ort-1.24.3/", scope.location.origin).href },
      });
      payload = { ready: true };
    } else if (data.type === "predict" && engine && data.payload?.sources) {
      // Older Emscripten builds expose a thenable module, not a Promise.
      // The SDK has already initialized it; awaiting that thenable can hang.
      const cv = cvModule instanceof Promise ? await cvModule : cvModule;
      const results = [];
      for (const source of data.payload.sources) {
        const bitmap = await createImageBitmap(source);
        let mat: InstanceType<typeof cv.Mat> | undefined;
        try {
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          const context = canvas.getContext("2d", { willReadFrequently: true });
          if (!context) throw new Error("Could not prepare the captured frame for recognition.");
          context.drawImage(bitmap, 0, 0);
          const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height);
          // Supply the SDK's supported Mat input; its Blob adapter needs a DOM.
          mat = cv.matFromArray(pixels.height, pixels.width, cv.CV_8UC4, pixels.data);
          results.push(...await engine.predict(mat, data.payload.params));
        } finally { mat?.delete(); bitmap.close(); }
      }
      payload = results;
    } else throw new Error("Recognition is not ready. Retry preparation.");
    scope.postMessage({ kind: "worker-transport-response", requestId: data.requestId, status: "success", payload });
  } catch (error) {
    scope.postMessage({ kind: "worker-transport-response", requestId: data.requestId, status: "error", error: { message: error instanceof Error ? error.message : "Recognition failed." } });
  }
};
