"""Run with calibre-debug -e; uses calibre's own OPF reader and Qt clipboard."""
import argparse
from io import BytesIO
from pathlib import Path
import sys
import json
import base64

from calibre.ebooks.metadata.opf2 import OPF
from qt.core import QApplication, QMimeData, QFileDialog, QLabel, QPushButton, QVBoxLayout, QWidget, QMessageBox

MIME = 'application/calibre-book-metadata'


def read_opf(path):
    return parse_opf(Path(path).read_bytes())


def parse_opf(data):
    if len(data) > 2_000_000:
        raise ValueError('OPF is larger than 2 MB.')
    # Export files need no external entities, DTDs, images or network access.
    if b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper():
        raise ValueError('DTDs and entities are not allowed.')
    from lxml import etree
    root = etree.fromstring(data, parser=etree.XMLParser(resolve_entities=False, no_network=True))
    if root.getroottree().docinfo.doctype:
        raise ValueError('DTDs and entities are not allowed.')
    ns = {'o': 'http://www.idpf.org/2007/opf', 'dc': 'http://purl.org/dc/elements/1.1/'}
    if root.tag != '{http://www.idpf.org/2007/opf}package':
        raise ValueError('Not an OPF package file.')
    for tag in ('title', 'creator'):
        if not any((el.text or '').strip() for el in root.findall('o:metadata/dc:' + tag, ns)):
            raise ValueError('A title and author are required.')
    mi = OPF(BytesIO(data), populate_spine=False, read_toc=False, try_to_guess_cover=False).to_book_metadata()
    return data, mi


def parse_transfer(text):
    if len(text) > 14_000_000:
        raise ValueError('Transfer is larger than 14 MB.')
    text = text.lstrip('\ufeff').strip()
    image = None
    if text.startswith('{'):
        packet = json.loads(text)
        if packet.get('format') != 'calibre-amazon-export' or packet.get('version') != 1:
            raise ValueError('Not an export package. Use “Copy for calibre” or “Download package” in the userscript.')
        opf = packet.get('opf')
        if not isinstance(opf, str):
            raise ValueError('The package does not contain OPF metadata.')
        data, mi = parse_opf(opf.encode('utf-8'))
        cover = packet.get('cover')
        if cover is not None:
            if not isinstance(cover, dict) or cover.get('mime') not in ('image/jpeg', 'image/png', 'image/webp') or not isinstance(cover.get('base64'), str):
                raise ValueError('Invalid cover data.')
            raw = base64.b64decode(cover['base64'], validate=True)
            if not raw or len(raw) > 8_000_000:
                raise ValueError('Cover is empty or larger than 8 MB.')
            from qt.core import QBuffer, QByteArray, QIODevice, QImageReader
            buffer = QBuffer()
            buffer.setData(QByteArray(raw))
            buffer.open(QIODevice.OpenModeFlag.ReadOnly)
            reader = QImageReader(buffer)
            fmt = bytes(reader.format())
            if fmt not in (b'jpeg', b'png', b'webp'):
                raise ValueError('Cover is not a JPEG, PNG or WebP image.')
            size = reader.size()
            if not size.isValid() or size.width() * size.height() > 20_000_000:
                raise ValueError('Cover dimensions are invalid or too large.')
            reader.setAutoTransform(True)
            image = reader.read()
            if image.isNull():
                raise ValueError('Could not decode the cover image.')
    else:
        data, mi = parse_opf(text.encode('utf-8'))
    return data, mi, image


def read_transfer(path):
    raw = Path(path).read_bytes()
    if raw.lstrip(b'\xef\xbb\xbf \r\n\t').startswith(b'{'):
        return parse_transfer(raw.decode('utf-8-sig'))
    data, mi = parse_opf(raw)
    return data, mi, None


def mime_data(data, mi, image=None):
    md = QMimeData()
    md.setText(str(mi))
    md.setData(MIME, data)
    if image is not None:
        md.setImageData(image)
    return md


def convert_clipboard(clipboard):
    """Validate first; invalid input must leave the clipboard untouched."""
    current = clipboard.mimeData()
    if current is not None and current.hasFormat(MIME):
        data, mi = parse_opf(bytes(current.data(MIME)))
        return mi, False
    text = clipboard.text().lstrip('\ufeff').strip()
    if not text:
        raise ValueError('The clipboard is empty. Click “Copy for calibre” on Amazon first.')
    data, mi, image = parse_transfer(text)
    clipboard.setMimeData(mime_data(data, mi, image))
    return mi, True


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('opf', nargs='?')
    p.add_argument('--check', action='store_true', help='Parse and verify without touching clipboard')
    args = p.parse_args()
    if args.check:
        data, mi, image = read_transfer(args.opf)
        md = mime_data(data, mi, image)
        assert md.hasFormat(MIME) and bytes(md.data(MIME)) == data
        print(str(mi))
        print('PASS: OPF parser and QMimeData round-trip; system clipboard unchanged.')
        return
    app = QApplication(sys.argv[:1])
    window = QWidget()
    window.setWindowTitle('Amazon → calibre Clipboard')
    layout = QVBoxLayout(window)
    label = QLabel()
    from qt.core import Qt
    label.setTextFormat(Qt.TextFormat.PlainText)
    label.setText('Click “Copy for calibre” on Amazon, then import it here.\n\nIn calibre, select a single target book and use\n“Edit metadata → Paste metadata”.\nExisting fields may be replaced.\nKeep this window open until you have pasted the metadata.')
    layout.addWidget(label)
    book = QLabel('No metadata imported yet.')
    book.setTextFormat(Qt.TextFormat.PlainText)
    layout.addWidget(book)
    preview = QLabel()
    layout.addWidget(preview)
    def show_cover(image):
        from qt.core import QPixmap
        if image is None or image.isNull():
            preview.clear()
            return
        preview.setPixmap(QPixmap.fromImage(image).scaled(120, 180, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation))
    take = QPushButton('Import from clipboard')
    layout.addWidget(take)
    file_button = QPushButton('Open file …')
    layout.addWidget(file_button)
    button = QPushButton('Copy metadata to clipboard')
    button.setEnabled(False)
    status = QLabel('Ready. Your library changes only when you paste into calibre.')
    status.setTextFormat(Qt.TextFormat.PlainText)
    status.setWordWrap(True)
    loaded = None
    def take_clipboard():
        nonlocal loaded
        # Do not leave a previous file ready to copy after switching to clipboard mode.
        loaded = None
        button.setEnabled(False)
        try:
            mi, changed = convert_clipboard(app.clipboard())
            md = app.clipboard().mimeData()
            image = md.imageData() if md.hasImage() else None
            show_cover(image)
            book.setText(f'{mi.title}\n{", ".join(mi.authors)}')
            status.setText(('Imported' if changed else 'Already in calibre format') + (' – with cover.' if image is not None else ' – without cover.') + ' Now use “Paste metadata” in calibre.')
        except Exception as e:
            book.setText('No metadata imported.')
            show_cover(None)
            status.setText(f'Invalid OPF metadata: {e}\nClipboard unchanged. Click “Copy for calibre” in the userscript first.')
    def load_file(path=None):
        nonlocal loaded
        path = path or QFileDialog.getOpenFileName(window, 'Select Amazon export', str(Path.home() / 'Downloads'), 'Amazon export (*.opf *.json)')[0]
        if not path:
            return
        loaded = None
        button.setEnabled(False)
        try:
            loaded = read_transfer(path)
            show_cover(loaded[2])
            book.setText(f'{loaded[1].title}\n{", ".join(loaded[1].authors)}\n{path}')
            button.setEnabled(True)
            status.setText('File loaded. Click “Copy metadata to clipboard”.')
        except Exception as e:
            book.setText('No file loaded.')
            show_cover(None)
            status.setText(f'Could not read OPF metadata: {e}')
    def copy():
        if loaded is None:
            return
        app.clipboard().setMimeData(mime_data(*loaded))
        status.setText('Copied. Now use “Paste metadata” in calibre.')
    take.clicked.connect(take_clipboard)
    file_button.clicked.connect(lambda: load_file())
    button.clicked.connect(copy)
    layout.addWidget(button)
    layout.addWidget(status)
    if args.opf:
        load_file(args.opf)
    window.show()
    app.exec()


if __name__ == '__main__':
    main()
