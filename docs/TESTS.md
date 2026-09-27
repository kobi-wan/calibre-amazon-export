# Test status

Tested during local development with Node.js, Playwright, Edge 153 and calibre 9.4 on Windows. The everyday workflow was manually exercised with Firefox and Violentmonkey.

- Unit tests: dates, regional languages/identifiers, ISBN checksums, XML escaping and required fields.
- Browser tests: synthetic paperback, Kindle and audiobook pages; editable form, description line breaks, cover packets, clipboard errors, downloads and category filtering.
- Placement tests: button below samples, cover width, resizing, delayed samples/categories and hiding outside supported categories.
- Helper tests: OPF validation, MIME data, file input, clipboard conversion and cover decoding. GUI smoke tests use offscreen Qt; font rendering in that environment is not representative of Windows.
- Earlier native clipboard and disposable-library round trips passed. No user library is modified by the fixture tests.

Run `npm test`, `npm run test:browser` and `node test/placement.cjs` with Playwright and Edge installed. Then run `calibre-debug -e test/helper_check.py` and `calibre-debug -e test/helper_gui.py`. Browser tests generate the files consumed by helper tests.

Live Amazon layouts vary. The latest packaging/metadata changes do not imply renewed manual testing of every storefront. Report the script version, browser, userscript manager, Amazon region and steps when filing an issue. Do not include account data or private exports.
