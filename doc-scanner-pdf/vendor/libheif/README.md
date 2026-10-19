libheif 1.23.2 (LGPL-3.0) compiled to WebAssembly by libheif-js 1.23.2 — https://github.com/catdad-experiments/libheif-js
  libheif-bundle.js   from npm libheif-js@1.23.2 (libheif-wasm/libheif-bundle.js): the decoder with its .wasm embedded,
                      one file, so it also works from file:// and in the Apps Script and Android versions
  npm tarball integrity sha512-qvHIXtggEsw1lCNCWBYKloL2Z36DJBm0R9ThGiH2JnhKYdeZFLPFkP30Lw4yMskxxhx0bKg1gLrBHX1D2w2pSw==
The file is byte-identical to the npm release; see SHA256SUMS.
Used only to decode HEIC/HEIF photos (iPhone and many Android cameras) that the browser cannot decode itself;
loaded on demand by js/heic.js in a Web Worker (js/heic-worker.js), never for other images.

Licenses: libheif — GNU LGPL 3.0 (LICENSE-libheif, with its bundled libde265 decoder under LGPL 3.0);
libheif-js packaging — see LICENSE-libheif-js. Source code of libheif: https://github.com/strukturag/libheif
(tag v1.23.2); build scripts: https://github.com/catdad-experiments/libheif-js. The library is a separate file
loaded at run time and can be replaced with another build of the same version.
