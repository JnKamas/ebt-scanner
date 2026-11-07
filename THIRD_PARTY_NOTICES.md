# Third-party notices

The [MIT license](LICENSE) covers EBT Scanner's original code and docs.
Dependencies and bundled assets keep their own licenses and notices.

## OCR and flags

| Component | License | Included notices |
| --- | --- | --- |
| PaddleOCR.js 0.4.2, PaddlePaddle Authors | Apache-2.0 | [License](public/ocr/LICENSE.PaddleOCR.txt), [source](https://github.com/PaddlePaddle/PaddleOCR/tree/main/paddleocr-js) |
| OpenCV.js 4.10.0-release.1, TechStark package (used by PaddleOCR) | Apache-2.0 | [Source and notices](https://github.com/TechStark/opencv-js) |
| PP-OCRv6 tiny detection and recognition models | Apache-2.0 | [Detection card](public/ocr/tiny_det.MODEL_CARD.md), [recognition card](public/ocr/tiny_rec.MODEL_CARD.md), [license](public/ocr/LICENSE.PaddleOCR.txt) |
| ONNX Runtime Web 1.24.3, Microsoft Corporation | MIT | [License](public/ocr/LICENSE.onnxruntime.txt), [upstream notices](public/ocr/THIRD_PARTY_NOTICES.onnxruntime.txt), [source](https://github.com/microsoft/onnxruntime/tree/v1.24.3) |
| flag-icons, Copyright (c) 2013 Panayiotis Lipiridis | MIT | [License](public/flags/LICENSE.txt), [source](https://github.com/lipis/flag-icons) |

The models, runtime files and flags are redistributed without modification.
[PROVENANCE.json](public/ocr/PROVENANCE.json) records OCR sources and hashes.
The full ONNX notices are preserved, including upstream components that may not
be enabled in this WebAssembly build.

Next.js, React and other npm packages retain their own licenses. The lockfile
records resolved versions. Preserve notices in packages and generated bundles
when redistributing the app.

## Services and reference data

- [EuroBillTracker](https://www.eurobilltracker.com/) supplies the account and note
  API. This app is independent; its license grants no rights to EBT data or trademarks.
- [Photon](https://github.com/komoot/photon) supplies address lookup using
  OpenStreetMap data. Keep the [OpenStreetMap attribution](https://www.openstreetmap.org/copyright).
  No Photon server code is bundled.
- Banknote mappings follow the [ECB design tables](https://www.ecb.europa.eu/euro/banknotes/current/design/html/index.en.html)
  and [Bundesbank reference](https://www.bundesbank.de/dynamic/action/en/tasks/cash-management/frequently-asked-questions/frequently-asked-questions-euro-banknotes/642706/frequently-asked-questions-about-the-euro-banknotes?contentId=640556&firstLetter=W).
  No banknote photographs are bundled.

Names and marks belong to their owners; no endorsement is implied.
