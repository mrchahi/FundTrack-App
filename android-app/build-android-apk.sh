#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
echo "Building FundTrack Debug APK..."
if [ -x "./gradlew" ]; then
  ./gradlew assembleDebug
elif command -v gradle >/dev/null 2>&1; then
  gradle assembleDebug
else
  echo "Gradle not installed in CLI. Open this folder in Android Studio -> Build > Build APK(s)."
  exit 1
fi

echo "APK generated at: app/build/outputs/apk/debug/app-debug.apk"
