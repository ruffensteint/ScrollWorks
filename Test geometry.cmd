@echo off
cd /d "%~dp0"
"%USERPROFILE%\.cargo\bin\cargo.exe" test --release -p scroll_core > test-log.txt 2>&1
if errorlevel 1 (echo TESTS FAILED>> test-log.txt) else (echo TESTS OK>> test-log.txt)
timeout /t 5
