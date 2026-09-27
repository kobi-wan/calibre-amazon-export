"""Exercise validation and MIME construction without writing system clipboard."""
import importlib.util
from pathlib import Path
from tempfile import TemporaryDirectory

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('bridge', root / 'tools' / 'opf_clipboard.py')
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)
data, mi = bridge.read_opf(root / 'test/output/browser.opf')
md = bridge.mime_data(data, mi)
assert md.hasFormat(bridge.MIME)
assert bytes(md.data(bridge.MIME)) == data
assert 'Anna Müller' in md.text()
class Clipboard:
    def __init__(self, text):
        from qt.core import QMimeData
        self.md = QMimeData()
        self.md.setText(text)
        self.writes = 0
    def text(self): return self.md.text()
    def mimeData(self): return self.md
    def setMimeData(self, value):
        self.md = value
        self.writes += 1

clip = Clipboard('\ufeff  ' + data.decode('utf-8') + '\n')
converted, changed = bridge.convert_clipboard(clip)
assert changed and converted.title == mi.title and clip.writes == 1
assert clip.md.hasFormat(bridge.MIME)
converted, changed = bridge.convert_clipboard(clip)
assert not changed and clip.writes == 1
packet_text = (root / 'test/output/cover-packet.json').read_text(encoding='utf-8')
clip = Clipboard(packet_text)
converted, changed = bridge.convert_clipboard(clip)
assert changed and clip.md.hasImage()
assert clip.md.imageData().width() == 120 and clip.md.imageData().height() == 180
import json
packet = json.loads(packet_text)
for mutation in ({'version': 99}, {'cover': {'mime':'image/png', 'base64':'not base64!'}}, {'cover': {'mime':'image/svg+xml', 'base64':'AAAA'}}):
    bad = json.dumps({**packet, **mutation})
    clip = Clipboard(bad)
    try:
        bridge.convert_clipboard(clip)
    except ValueError:
        pass
    else:
        raise AssertionError('Invalid cover packet accepted')
    assert clip.text() == bad and clip.writes == 0
for bad in ('', 'ordinary copied text', '<broken>'):
    clip = Clipboard(bad)
    try:
        bridge.convert_clipboard(clip)
    except Exception:
        pass
    else:
        raise AssertionError('Invalid clipboard text accepted')
    assert clip.text() == bad and clip.writes == 0
with TemporaryDirectory(prefix='opf-validate-') as folder:
    for i, content in enumerate([
        b'<html/>',
        b'<!DOCTYPE package [<!ENTITY e SYSTEM "file:///not-to-read">]><package/>',
        '<!DOCTYPE package><package/>'.encode('utf-16'),
        b'<package xmlns="http://www.idpf.org/2007/opf"><metadata/></package>',
    ]):
        path = Path(folder) / f'bad-{i}.opf'
        path.write_bytes(content)
        try:
            bridge.read_opf(path)
        except ValueError:
            pass
        else:
            raise AssertionError(f'Invalid input {i} accepted')
print('PASS: helper validation, exact MIME bytes, text fallback; system clipboard unchanged.')
