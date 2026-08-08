// 在 Actions 构建时向 Capacitor 生成的 AndroidManifest.xml 注入摄像头权限
// 供 WebView getUserMedia（车牌摄像头识别）使用
import fs from 'node:fs';

const file = 'android/app/src/main/AndroidManifest.xml';
let s = fs.readFileSync(file, 'utf8');

if (!s.includes('android.permission.CAMERA')) {
  s = s.replace('<application', '    <uses-permission android:name="android.permission.CAMERA" />\n    <uses-feature android:name="android.hardware.camera" android:required="false" />\n    <application');
  fs.writeFileSync(file, s);
  console.log('[patch] CAMERA permission injected');
} else {
  console.log('[patch] CAMERA permission already present');
}
