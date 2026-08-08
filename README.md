# 车辆预检单登记工具（vehicle-precheck）

检测站预检员使用的手机端工具：快速录入车辆信息，一键生成"车辆预检单"卡片图片，直接分享到微信群；支持摄像头识别车牌自动录入。

- **形态**：纯前端 Web 应用（无后端、无 CDN、无框架），可打包为安卓 APK
- **数据**：全部保存在手机本地（localStorage），不上传任何服务器
- **离线**：OCR 引擎与语言包均内置本地，完全离线可用

---

## 一、功能清单

| 功能 | 说明 |
|---|---|
| 车牌号录入 | 手动输入 + 摄像头识别（OCR）自动填入，识别结果需人工确认；省份汉字由设置中的省份自动前置 |
| 车辆信息 | 车牌号、车辆类型、燃油类型（汽油/柴油）、挡位（手动/自动）、驱动（前驱/后驱/四驱）、行驶公里数、车辆照片、备注 |
| 检测信息 | 预检项目（外检/安检 等可多选）、检测线（1号线/2号线） |
| 预检单生成 | Canvas 绘制 750px 卡片图片，含站名、序号、车牌、车辆信息表、预检员/时间页脚 |
| 分享 | ① 微信内置浏览器：引导"长按图片→发送给朋友→选群"；② 手机 Chrome/Safari：调系统分享面板直接发图；③ 兜底：保存图片 |
| 记录管理 | 今日记录列表、单条删除、一键清空、导出 CSV |
| 设置 | 站名、预检员姓名、省份（用于车牌识别前置） |
| 序号 | 每天从 1 开始自动编号，随卡片打印 |

## 二、目录结构

```
vehicle-precheck/
├── www/                    # Web 应用源码（Capacitor webDir）
│   ├── index.html          # 页面结构：录入表单 + 4 个弹窗（预览/设置/确认/OCR）+ 记录页
│   ├── style.css           # 移动端样式（工业蓝灰、chips 多选、OCR 取景框）
│   ├── app.js              # 全部逻辑（约 1100 行）
│   └── lib/tesseract/      # 本地 OCR 引擎（勿改动）
│       ├── tesseract.min.js            # Tesseract.js v5.1.1 主库
│       ├── worker.min.js               # worker 脚本
│       ├── tesseract-core-simd-lstm.wasm.js   # SIMD 核心（主流浏览器/手机）
│       ├── tesseract-core-lstm.wasm.js        # 非 SIMD 核心（旧设备兜底）
│       └── eng.traineddata             # 英文语言包（仅识别字母数字）
├── docs/需求说明.md        # 需求文档
├── scripts/patch-android.mjs  # 打包时注入摄像头权限的脚本
├── capacitor.config.json   # Capacitor 配置（appId / webDir）
├── package.json
├── .github/workflows/build-apk.yml  # GitHub Actions：云端打包 APK
└── README.md               # 本文档
```

## 三、技术要点

- **技术栈**：原生 HTML/CSS/JS（ES5 语法，兼容老手机浏览器），无任何依赖
- **卡片生成**：`generateImage(record)` 用 Canvas 绘制，`CARD_W = 750`，按设备像素比缩放导出 PNG
- **车牌识别**：Tesseract.js v5.1.1 本地 OCR
  - 配置：`createWorker('eng', 1, { workerPath, corePath, langPath, gzip: false })`
  - 只识别 `A-Z0-9`（白名单），`pageseg_mode 7`（单行），省份汉字由设置前置拼装
  - 首次加载引擎约 10-20 秒（本地 12MB 资源），之后复用单例 worker
  - 摄像头需 HTTPS 或 localhost；HTTP 环境自动降级为"拍照选图识别"
- **本地存储**：`yujian_records_v1`（记录数组）、`yujian_settings_v1`（设置对象）
- **分享策略**：`navigator.share` 文件分享 → 微信 UA 引导长按 → 通用保存提示（三级降级）
- **测试钩子**：`window.__yujianTest = { recognizePlate, prepareOcrCanvas }`（供自动化验证）

## 四、本地运行（开发调试）

```bash
# www/ 目录为 web 资源根，任意静态服务器即可，例如：
npx serve www                  # 或
node static-server.js www 8765
# 浏览器打开 http://localhost:8765
```

## 五、打包安卓 APK（Capacitor + GitHub Actions）

1. 本机安装 git 与 GitHub CLI（`gh`），登录 GitHub
2. 将本目录推送为 GitHub 仓库（`gh repo create`）
3. 仓库内已含 `.github/workflows/build-apk.yml`：云端执行 `npx cap add android` → 注入摄像头权限 → `gradlew assembleDebug`
4. 构建产物：`android/app/build/outputs/apk/debug/app-debug.apk`，上传为 Actions 构件 / Release，手机下载安装即可

> 需要重新打包时：改完 `www/` 下代码 → `git push` 即自动触发云端构建。

## 六、使用说明（手机）

1. 安装 APK（或浏览器打开部署后的 HTTPS 地址）
2. 首次使用建议先到"设置"确认站名、预检员、省份
3. 录入：点"识别车牌"对准车牌拍照/选图 → 确认号牌 → 补填其余字段 → 生成预检单
4. 预览卡片 → 分享到微信群（或保存图片）
5. 需要留底时到"今日记录"导出 CSV

## 七、已知限制

- 车牌识别为本地 OCR，识别率受拍照角度/光线影响；识别结果需人工确认后录入
- 浏览器版（非 APK）在局域网 HTTP 下无法调用摄像头，自动降级拍照识别
- 数据保存在手机本地，清空浏览器数据/卸载 App 会丢失记录（可先导出 CSV）
