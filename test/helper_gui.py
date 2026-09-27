"""Offscreen smoke test: file import and clipboard conversion through actual UI buttons."""
import os
os.environ['QT_QPA_PLATFORM'] = 'offscreen'
import sys
import importlib.util
from pathlib import Path
from qt.core import QApplication, QTimer, QPushButton, QLabel

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('bridge', root / 'tools/opf_clipboard.py')
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)
app = QApplication([])
bridge.QApplication = lambda args: app
packet = root / 'test/output/cover-packet.json'
sys.argv = ['test', str(packet)]
errors = []
def check():
    try:
        window = next(w for w in app.topLevelWidgets() if w.windowTitle() == 'Amazon → calibre Clipboard')
        buttons = {b.text(): b for b in window.findChildren(QPushButton)}
        buttons['Copy metadata to clipboard'].click()
        assert app.clipboard().mimeData().hasImage()
        app.clipboard().setText(packet.read_text(encoding='utf-8'))
        buttons['Import from clipboard'].click()
        assert app.clipboard().mimeData().hasImage()
        assert any('with cover' in label.text() for label in window.findChildren(QLabel))
        window.grab().save(str(root / 'test/output/helper-preview.png'))
        print('PASS: helper GUI file load, copy, clipboard conversion and cover preview (offscreen).')
    except Exception as e:
        errors.append(e)
    finally:
        app.quit()
QTimer.singleShot(100, check)
QTimer.singleShot(5000, app.quit)
bridge.main()
if errors:
    raise errors[0]
