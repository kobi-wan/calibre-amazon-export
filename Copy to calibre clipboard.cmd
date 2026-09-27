@echo off
setlocal
set "CALIBRE_DEBUG=%ProgramFiles%\Calibre2\calibre-debug.exe"
if not exist "%CALIBRE_DEBUG%" (
  echo calibre-debug.exe was not found. Please install calibre or update this path.
  pause
  exit /b 1
)
if "%~1"=="" (
  "%CALIBRE_DEBUG%" -e "%~dp0tools\opf_clipboard.py"
) else (
  "%CALIBRE_DEBUG%" -e "%~dp0tools\opf_clipboard.py" -- "%~1"
)
if errorlevel 1 pause
