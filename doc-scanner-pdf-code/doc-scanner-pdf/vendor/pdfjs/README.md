PDF.js 6.3.289 (Apache-2.0) — https://github.com/mozilla/pdf.js
  pdf.min.mjs, pdf.worker.min.mjs   from npm pdfjs-dist@6.3.289, legacy/build/ — the legacy build runs on older
                                    browsers and Android WebViews (the modern build needs JavaScript features that
                                    Chrome/WebView 124, still on many tablets, does not have)
  wasm/                             image decoders (JBIG2, JPEG 2000, colour profiles) from the same package, with their
                                    licenses (wasm/LICENSE_*)
  standard_fonts/                   the 14 standard PDF fonts (Foxit, Liberation) from the same package (LICENSE_FOXIT,
                                    LICENSE_LIBERATION)
  npm tarball integrity sha512-ZHjSVpDa3D6izMq8/04lvkhkATUmL9px6ChPaXc1k6nU2Mrhlg1/7F0bdUqCwUjw3NsPTfPZsMDUU6ZIcRaeQw==
All files are byte-identical to the npm release; see SHA256SUMS. Not included: cmaps/ (CJK encodings), the JavaScript
sandbox (quickjs) and the no-WebAssembly fallbacks — the app never runs scripts from PDF files.
Used by js/pdf-tools.js to turn PDF files into JPEG images or Word documents, loaded only when the user converts a PDF.
