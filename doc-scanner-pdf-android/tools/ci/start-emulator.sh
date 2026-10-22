#!/usr/bin/env bash
# เปิด Android emulator บน GitHub-hosted runner (ubuntu, มี KVM) แล้วรอจนพร้อมใช้
#   tools/ci/start-emulator.sh <api> <device> <name>     เช่น 37.0 pixel_7 phone
set -euo pipefail
api="$1"; device="$2"; name="$3"
image="system-images;android-${api};google_apis;x86_64"
sdk="$ANDROID_HOME"
[[ "$api" =~ ^[0-9]+(\.[0-9]+)?$ && "$name" =~ ^[a-z0-9-]+$ ]] || { echo "bad arguments"; exit 2; }

# KVM สำหรับผู้ใช้ runner
echo 'KERNEL=="kvm", GROUP="kvm", MODE="0666", OPTIONS+="static_node=kvm"' | sudo tee /etc/udev/rules.d/99-kvm4all.rules > /dev/null
sudo udevadm control --reload-rules
sudo udevadm trigger --name-match=kvm

# yes stops with SIGPIPE when sdkmanager is done — not an error (pipefail)
{ yes 2>/dev/null || true; } | "$sdk/cmdline-tools/latest/bin/sdkmanager" --install "emulator" "platform-tools" "$image" > /dev/null
# the same AVD folder for avdmanager, this script and the emulator (defaults differ between tool versions)
export ANDROID_AVD_HOME="$RUNNER_TEMP/avd"
mkdir -p "$ANDROID_AVD_HOME"
echo no | "$sdk/cmdline-tools/latest/bin/avdmanager" create avd -n "$name" -k "$image" -d "$device" --force
cfg="$ANDROID_AVD_HOME/$name.avd/config.ini"
[ -f "$cfg" ] || { echo "::error::AVD config not found at $cfg"; ls -la "$ANDROID_AVD_HOME"; exit 1; }
set_cfg() { # key value — replace the key or add it (no duplicate keys)
  if grep -q "^$1=" "$cfg"; then sed -i "s|^$1=.*|$1=$2|" "$cfg"; else echo "$1=$2" >> "$cfg"; fi
}
set_cfg hw.camera.back emulated
set_cfg hw.camera.front emulated
set_cfg hw.keyboard yes
set_cfg hw.ramSize 4096
set_cfg disk.dataPartition.size 6G

nohup "$sdk/emulator/emulator" -avd "$name" -no-window -no-audio -no-boot-anim -no-snapshot \
  -gpu swiftshader_indirect -camera-back emulated -camera-front emulated -memory 4096 > "$RUNNER_TEMP/emulator.log" 2>&1 &
adb="$sdk/platform-tools/adb"
timeout 300 "$adb" wait-for-device || { tail -80 "$RUNNER_TEMP/emulator.log"; echo "::error::emulator did not start"; exit 1; }
for _ in $(seq 1 240); do
  [ "$("$adb" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ] && break
  sleep 2
done
[ "$("$adb" shell getprop sys.boot_completed | tr -d '\r')" = "1" ] || { tail -50 "$RUNNER_TEMP/emulator.log"; echo "::error::emulator did not boot"; exit 1; }
for s in window_animation_scale transition_animation_scale animator_duration_scale; do "$adb" shell settings put global "$s" 0; done
"$adb" shell settings put system screen_off_timeout 1800000
"$adb" shell svc power stayon true
# จอเปิด ไม่มีหน้าล็อก และแถบแจ้งเตือนปิดอยู่ — การแตะในการทดสอบต้องไปถึงแอป
"$adb" shell input keyevent KEYCODE_WAKEUP
"$adb" shell locksettings set-disabled true > /dev/null 2>&1 || true
"$adb" shell wm dismiss-keyguard || true
"$adb" shell cmd statusbar collapse > /dev/null 2>&1 || true
# "แอปไม่ตอบสนอง" ของแอประบบบน emulator (เช่น Google Play services ที่ช้า) ไม่ต้องขึ้นหน้าต่างบังแอปที่ทดสอบ
"$adb" shell settings put global hide_error_dialogs 1 || true
echo "Emulator ready: $name ($device, Android API $api) — $("$adb" shell wm size | tr -d '\r'), $("$adb" shell wm density | tr -d '\r')"
"$adb" shell dumpsys webviewupdate | grep -m1 -i "current webview package" || true
