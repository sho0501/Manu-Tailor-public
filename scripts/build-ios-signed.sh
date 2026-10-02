#!/usr/bin/env bash
set -euo pipefail
mkdir -p output
if [[ -z "${APPLE_CERTIFICATE_BASE64:-}" || -z "${APPLE_PROVISION_PROFILE_BASE64:-}" || -z "${APPLE_TEAM_ID:-}" ]]; then
  echo 'Signing required: Simulator build is available. No installable IPA was produced. Configure APPLE_CERTIFICATE_BASE64, APPLE_CERTIFICATE_PASSWORD, APPLE_PROVISION_PROFILE_BASE64, APPLE_TEAM_ID and APPLE_BUNDLE_ID.' | tee output/ios-signing-required.txt >> "$GITHUB_STEP_SUMMARY"
  echo 'signed=false' >> "$GITHUB_OUTPUT"
  exit 0
fi
KEYCHAIN="$RUNNER_TEMP/manu.keychain-db"
KEYCHAIN_PASSWORD=$(openssl rand -hex 24)
trap 'security delete-keychain "$KEYCHAIN" || true' EXIT
printf '%s' "$APPLE_CERTIFICATE_BASE64" | base64 --decode > "$RUNNER_TEMP/certificate.p12"
printf '%s' "$APPLE_PROVISION_PROFILE_BASE64" | base64 --decode > "$RUNNER_TEMP/profile.mobileprovision"
security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security set-keychain-settings -lut 21600 "$KEYCHAIN"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security import "$RUNNER_TEMP/certificate.p12" -P "$APPLE_CERTIFICATE_PASSWORD" -A -t cert -f pkcs12 -k "$KEYCHAIN"
security set-key-partition-list -S apple-tool:,apple:,codesign: -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security list-keychains -d user -s "$KEYCHAIN"
security cms -D -i "$RUNNER_TEMP/profile.mobileprovision" > "$RUNNER_TEMP/profile.plist"
PROFILE_UUID=$(/usr/libexec/PlistBuddy -c 'Print UUID' "$RUNNER_TEMP/profile.plist")
export PROFILE_UUID
mkdir -p "$HOME/Library/MobileDevice/Provisioning Profiles"
cp "$RUNNER_TEMP/profile.mobileprovision" "$HOME/Library/MobileDevice/Provisioning Profiles/$PROFILE_UUID.mobileprovision"
python3 - <<'PY'
import os, plistlib
with open('output/ExportOptions.plist','wb') as f:
    plistlib.dump({'method':os.environ['APPLE_EXPORT_METHOD'],'teamID':os.environ['APPLE_TEAM_ID'],'signingStyle':'manual','provisioningProfiles':{os.environ['APPLE_BUNDLE_ID']:os.environ['PROFILE_UUID']}},f)
with open(os.path.join(os.environ['RUNNER_TEMP'],'profile.plist'),'rb') as f:
    entitlements=plistlib.load(f).get('Entitlements',{})
with open('output/App.entitlements','wb') as f:
    plistlib.dump({k:v for k,v in entitlements.items() if k=='aps-environment'},f)
PY
xcodebuild -project apps/client/ios/App/App.xcodeproj -scheme App -configuration Release -destination 'generic/platform=iOS' -archivePath output/Manu-Tailor.xcarchive DEVELOPMENT_TEAM="$APPLE_TEAM_ID" CODE_SIGN_STYLE=Manual PROVISIONING_PROFILE_SPECIFIER="$PROFILE_UUID" CODE_SIGN_IDENTITY='Apple Distribution' CODE_SIGN_ENTITLEMENTS="$PWD/output/App.entitlements" archive
xcodebuild -exportArchive -archivePath output/Manu-Tailor.xcarchive -exportOptionsPlist output/ExportOptions.plist -exportPath output/ios-export
echo 'signed=true' >> "$GITHUB_OUTPUT"
