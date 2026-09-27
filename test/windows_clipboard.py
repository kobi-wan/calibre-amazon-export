"""Real Windows clipboard round-trip with separate reader; restore original formats."""
import importlib.util
import subprocess
import sys
import time
from pathlib import Path
from qt.core import QApplication, QMimeData

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('bridge', root / 'tools/opf_clipboard.py')
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)
app = QApplication(sys.argv[:1])
clip = app.clipboard()
expected = (root / 'test/output/browser.opf').read_bytes()
if '--read' in sys.argv:
    md = clip.mimeData()
    assert md.hasFormat(bridge.MIME)
    actual = bytes(md.data(bridge.MIME))
    assert actual.strip() == expected.strip()
    _, mi = bridge.parse_opf(actual)
    assert mi.title == 'Die Prüfung & das Rätsel'
    assert mi.authors == ['Anna Müller']
    if '--cover' in sys.argv:
        assert md.hasImage()
        img = md.imageData()
        assert img.width() == 120 and img.height() == 180
        assert img.pixelColor(0,0).name() == '#234b39'
        print('PASS: independent process reads cover image (dimensions and pixel verified).')
    print('PASS: independent process reads native calibre MIME and metadata from Windows clipboard.')
else:
    saved = QMimeData()
    original = clip.mimeData()
    if original is not None:
        for fmt in original.formats():
            saved.setData(fmt, original.data(fmt))
    ours = None
    process = None
    try:
        ours = (root / 'test/output/cover-packet.json').read_text(encoding='utf-8') if '--cover' in sys.argv else expected.decode('utf-8')
        clip.setText(ours)
        mi, changed = bridge.convert_clipboard(clip)
        assert changed and mi.title == 'Die Prüfung & das Rätsel'
        ours = str(mi)
        process = subprocess.Popen([sys.executable, '-e', str(Path(__file__).resolve()), '--', '--read'] + (['--cover'] if '--cover' in sys.argv else []), stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        deadline = time.monotonic() + 20
        while process.poll() is None and time.monotonic() < deadline:
            app.processEvents()
            time.sleep(0.01)
        if process.poll() is None:
            process.kill()
            raise TimeoutError('Clipboard reader did not finish')
        out, err = process.communicate()
        if process.returncode:
            raise RuntimeError(err.decode('utf-8', errors='replace'))
        print(out.decode('utf-8', errors='replace').strip())
    finally:
        # Avoid overwriting a new user clipboard entry if it changed during the test.
        if ours is not None and clip.text() == ours:
            clip.setMimeData(saved)
            app.processEvents()
            print('Original clipboard formats restored.')
