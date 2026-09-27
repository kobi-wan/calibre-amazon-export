# calibre Amazon Export — Proof of Concept

**Version 0.5.3 — First GitHub release.** A browser userscript reads metadata from an open Amazon book page. A small Windows helper converts the exported text to calibre's native clipboard format. No calibre plugin is required.

## Downloads

- [Install the userscript](https://github.com/kobi-wan/calibre-amazon-export/releases/latest/download/calibre-amazon-export.user.js)
- [Download the Windows package](https://github.com/kobi-wan/calibre-amazon-export/releases/latest)
- [Report a problem](https://github.com/kobi-wan/calibre-amazon-export/issues)

Author: **kobi-wan**. Licensed under the [MIT License](LICENSE).

The userscript checks published releases for updates according to your userscript manager settings. Download and extract a new Windows package to update the helper.

## Requirements and installation

- Your favorite browser with a userscript extension (Greasemonkey / Tampermonkey / Violentmonkey etc.).
- Windows with calibre installed. The launcher expects `%ProgramFiles%\Calibre2\calibre-debug.exe`; edit that path for other installations. The helper uses calibre's bundled Python and Qt.
- Install `calibre-amazon-export.user.js` in your userscript manager, including its complete header. Keep `Copy to calibre clipboard.cmd` beside the `tools` folder containing `opf_clipboard.py`.

To update, replace the complete userscript, save it and reload the Amazon page. Close and restart the helper.

## Quick start

1. Open an Amazon book page, select the intended edition and wait for it to load. Click **→ calibre** below the reading/audio sample buttons beside the cover. If no samples are available, the button appears below the cover; layouts without a recognizable cover use the title area.
2. Review the fields. Authors and tags use one entry per line. Paragraphs and explicit line breaks in the description are preserved. A selected audiobook displays a warning; export remains available.
3. Optionally select **Include cover** and wait for the preview. Click **Copy for calibre**.
4. Run **Copy to calibre clipboard.cmd** and click **Import from clipboard**. Keep the helper open until you paste.
5. In calibre, select one target book and use **Edit metadata → Paste metadata** (or the equivalent in your calibre language).

Pasting can replace existing metadata. Test on a disposable book first. calibre's `exclude_fields_on_paste` setting controls excluded fields. The helper does not open or modify a library itself.

For another book, repeat the copy/import/paste sequence. Do not copy unrelated text between these steps.

## Files, covers and advanced editing

**Download OPF** saves metadata without a cover. **Download package** includes the cover when selected, using a JSON package; otherwise it saves OPF. In the helper, use **Open file …**, then **Copy metadata to clipboard**. You can also drop an exported file onto the launcher.

**Advanced (JSON)** exposes the metadata model. Apply or discard JSON edits before exporting. **Save JSON** creates a diagnostic metadata file, not an importable cover package.

Cover downloads use the userscript manager's `GM_xmlhttpRequest` permission for three Amazon image hosts listed in the script header. Depending on the userscript manager, a separate permission prompt may not appear. **Find cover again** retries image detection after delayed loading. A missing cover URL is different from a failed download. Supported images are JPEG, PNG and WebP, up to 8 MB; the helper also limits decoded image dimensions.

## Regional support and limitations

Supported storefronts: amazon.de, amazon.com, amazon.co.uk, amazon.ca, amazon.com.au, amazon.in, amazon.fr, amazon.it, amazon.es, amazon.com.br, amazon.com.mx, amazon.co.jp, amazon.nl and amazon.se.

Parsing includes German, English, French, Italian, Spanish, Portuguese, Dutch, Swedish and Japanese field/date variants. The book language comes from product metadata, not the storefront. The ASIN identifier follows the region (`amazon` for the US, `amazon_de` for Germany, etc.). Ambiguous Canadian numeric dates are left blank.

Amazon layouts vary. Review authors, edition, series and tags before importing. Unrecognized values may need manual correction. US and German examples have been inspected on live pages; other language variants have fixture coverage, not comprehensive live-store testing. The interface language does not translate the book's title, description or other content.

## Why a helper?

calibre expects OPF XML under the native clipboard MIME type `application/calibre-book-metadata`. Browser clipboard restrictions prevent the tested workflow from writing that native format directly. Web custom formats are not equivalent to native clipboard formats. The helper validates the exported text and writes the native Qt clipboard data, plus the cover when provided.

**Test native clipboard** is an experimental capability check. A browser reporting success is not sufficient proof that calibre can read the result.

## Development and tests

- `calibre-amazon-export.user.js`: standalone userscript, no external code libraries.
- `tools/opf_clipboard.py`: local clipboard helper.
- `samples/example.opf`: synthetic sample.
- `test/unit.test.cjs`: date, language, ISBN and OPF validation.
- `test/browser.cjs`: isolated browser fixtures, form editing, downloads, covers and error handling.
- `test/helper_check.py`: helper validation without changing the system clipboard.
- `test/helper_gui.py`: offscreen helper UI test.
- `docs/TESTS.md`: test results and historical notes.


With Node.js, Playwright and Edge available, run `npm test` and `npm run test:browser`. Then run the helper tests using `calibre-debug -e test/helper_check.py` and `calibre-debug -e test/helper_gui.py`. Browser tests create the synthetic files consumed by the helper tests.

This is a PoC, not a packaged cross-platform application. Nothing is installed into calibre automatically.



The entry button requires a product URL, a product title and a recognized Books or Kindle category in the product breadcrumbs. Search filters and global navigation do not count. If the category cannot be identified, the button stays hidden; delayed category content is checked automatically.




