"""Isolated DB test of the same OPF parse/set_metadata path as GUI paste."""
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
import sys
import os
import importlib.util
if os.environ.get('CALIBRE_EXPORT_TEST_ISOLATED') != '1':
    import subprocess
    with TemporaryDirectory(prefix='calibre-test-config-') as config_dir:
        env = dict(os.environ, CALIBRE_CONFIG_DIRECTORY=config_dir, CALIBRE_EXPORT_TEST_ISOLATED='1')
        subprocess.run([sys.executable, '-e', str(Path(__file__).resolve()), '--', *sys.argv[1:]], env=env, check=True, timeout=30)
    raise SystemExit(0)
os.environ['QT_QPA_PLATFORM'] = 'offscreen'
from qt.core import QApplication
app = QApplication([])
from calibre.db.legacy import LibraryDatabase
from calibre.ebooks.metadata.book.base import Metadata
from calibre.ebooks.metadata.opf2 import OPF
from calibre.utils.date import as_local_time

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('bridge', root / 'tools/opf_clipboard.py')
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)
data, mi, image = bridge.read_transfer(sys.argv[1])
# calibre on Windows requires a library root shorter than 75 characters.
with TemporaryDirectory(prefix='ca-', dir=str(Path(os.environ['LOCALAPPDATA']) / 'Temp') if os.name == 'nt' else None) as folder:
    db = LibraryDatabase(folder)
    try:
        api = db.new_api
        book_id = api.create_book_entry(Metadata('Vorher', ['Testautor']))
        mi.application_id = mi.uuid_id = None
        api.set_metadata(book_id, mi, ignore_errors=True)
        if image is not None:
            api.set_cover({book_id: image})
            from qt.core import QImage
            restored = QImage.fromData(api.cover(book_id))
            assert restored.width() == 120 and restored.height() == 180
            print('PASS: cover saved in isolated calibre library and dimensions verified.')
        got = api.get_metadata(book_id)
        assert got.title == 'Die Prüfung & das Rätsel', got.title
        assert got.authors == ['Anna Müller'], got.authors
        assert got.publisher == 'Test & Sohn', got.publisher
        assert got.identifiers == {'amazon_de':'B08NWCLGCV','isbn':'9783161484100'}, got.identifiers
        assert got.languages == ['deu'], got.languages
        assert got.series == 'Die Prüfungen' and got.series_index == 2
        assert got.tags == ['Krimis & Thriller']
        assert as_local_time(got.pubdate).strftime('%Y-%m-%d') == '2024-03-15', got.pubdate
        assert '&lt;Geheimnis&gt;' in got.comments, got.comments
        assert '<br/>Eine zweite Zeile.' in got.comments, got.comments
        assert '<p>Ein neuer Absatz.</p>' in got.comments, got.comments
        print('PASS: installed calibre OPF parser -> isolated library -> all metadata fields verified.')
    finally:
        db.close()
