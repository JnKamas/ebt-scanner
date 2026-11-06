# Third-party software and assets

The root [MIT license](LICENSE) covers EBT Scanner's original code and documentation. It does not replace the licenses of dependencies, model weights, runtimes or flag artwork. Product names and marks belong to their respective owners; no affiliation or endorsement is implied.

## Vendored OCR assets

| Component | Files / version | Upstream terms and attribution |
| --- | --- | --- |
| PaddleOCR.js | npm `@paddleocr/paddleocr-js` 0.4.2 | Apache-2.0; PaddlePaddle Authors. [Repository](https://github.com/PaddlePaddle/PaddleOCR/tree/main/paddleocr-js), [license copy](public/ocr/LICENSE.PaddleOCR.txt). |
| PP-OCRv6 tiny ONNX detection and recognition models | `public/ocr/PP-OCRv6_tiny_det_onnx_infer.tar`, `public/ocr/PP-OCRv6_tiny_rec_onnx_infer.tar` | Apache-2.0 as declared by PaddlePaddle's official model cards. [Detection card](public/ocr/tiny_det.MODEL_CARD.md), [recognition card](public/ocr/tiny_rec.MODEL_CARD.md), [license copy](public/ocr/LICENSE.PaddleOCR.txt). |
| ONNX Runtime Web | `public/ocr/ort-1.24.3/`, npm `onnxruntime-web` 1.24.3 | MIT; Copyright (c) Microsoft Corporation. [License](public/ocr/LICENSE.onnxruntime.txt), [upstream third-party notices](public/ocr/THIRD_PARTY_NOTICES.onnxruntime.txt), [versioned source](https://github.com/microsoft/onnxruntime/tree/v1.24.3). |

The model archives are redistributed without modification and have been compared byte-for-byte by SHA-256 with the official PaddleOCR.js model URLs. The active runtime `.mjs` and `.wasm` files match the installed 1.24.3 package. EBT Scanner's runtime configuration is separate from these upstream files. [PROVENANCE.json](public/ocr/PROVENANCE.json) records sources, hashes and the review date; model cards and upstream license text are preserved as snapshots.

The full ONNX Runtime third-party notice file is reproduced unchanged as supplied by the upstream repository. It describes upstream components, including components that may not be enabled in this WebAssembly build. It is retained for attribution rather than a claim that every listed component is used by EBT Scanner.

## Flag artwork

Local SVG flags in `public/flags/` come from [flag-icons](https://github.com/lipis/flag-icons), Copyright (c) 2013 Panayiotis Lipiridis, under MIT. The full upstream notice is preserved in [public/flags/LICENSE.txt](public/flags/LICENSE.txt). These files are redistributed without modification by this release.

## npm dependencies and generated bundles

Next.js, React, ONNX Runtime Web, PaddleOCR.js and their transitive packages retain their own licenses. `package-lock.json` records exact resolved versions. Installed packages and generated JavaScript bundles may contain additional license notices; preserve those when redistributing builds. npm's package metadata is not a substitute for reviewing the actual upstream license text.

## External services and reference data

- [EuroBillTracker](https://www.eurobilltracker.com/) provides the external account and note API. EBT Scanner is an independent client, not the official EuroBillTracker application. This repository's MIT license does not grant rights to EuroBillTracker data, accounts or trademarks.
- Location lookup uses [Photon](https://github.com/komoot/photon) and OpenStreetMap-derived data. Retain the app's [OpenStreetMap attribution](https://www.openstreetmap.org/copyright) when displaying or reusing that data. No Photon server code is vendored here.
- Euro banknote code mappings are based on the linked ECB and Bundesbank references in the README. No banknote photographs are bundled.
