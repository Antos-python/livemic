#!/bin/zsh
# Uruchamia most go2rtc dla kamer eufy (dwuklik w Finderze).
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if [ ! -x ./go2rtc ]; then
  ARCH=$([ "$(uname -m)" = arm64 ] && echo arm64 || echo amd64)
  echo "Pobieram go2rtc ($ARCH) z github.com/AlexxIT/go2rtc ..."
  curl -fL# -o go2rtc.zip "https://github.com/AlexxIT/go2rtc/releases/latest/download/go2rtc_mac_${ARCH}.zip" || { echo "Nie udało się pobrać."; read; exit 1; }
  unzip -oq go2rtc.zip go2rtc && rm go2rtc.zip && chmod +x go2rtc
  xattr -d com.apple.quarantine go2rtc 2>/dev/null
fi

command -v ffmpeg >/dev/null || echo "UWAGA: brak ffmpeg — dźwięk z kamer nie zadziała (brew install ffmpeg)."

if [ ! -f go2rtc.yaml ]; then
  cp go2rtc.example.yaml go2rtc.yaml
  echo "Utworzono go2rtc.yaml — wpisz adresy RTSP kamer, zapisz i uruchom start.command ponownie."
  open -e go2rtc.yaml
  read; exit 0
fi

echo "go2rtc działa: http://localhost:1984   (zamknij okno albo Ctrl+C, aby zatrzymać)"
exec ./go2rtc -config go2rtc.yaml
