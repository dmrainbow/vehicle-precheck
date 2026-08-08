'use strict';

/* ============================================================
 * 车辆检测站预检登记工具
 * 纯前端，数据存 localStorage，车牌照片拍摄预览
 * ============================================================ */

/* ---------- 基础工具 ---------- */
function $(id) { return document.getElementById(id); }

function pad(n) { return String(n).padStart(2, '0'); }

function isToday(iso) {
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

function formatTime(iso) {
  const d = new Date(iso);
  return pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function formatDateTime(iso) {
  const d = new Date(iso);
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function loadImage(src) {
  return new Promise(function (resolve, reject) {
    const img = new Image();
    img.onload = function () { resolve(img); };
    img.onerror = function () { reject(new Error('图片加载失败')); };
    img.src = src;
  });
}

/* ---------- 设置 ---------- */
const RECORDS_KEY = 'yujian_records_v1';
const SETTINGS_KEY = 'yujian_settings_v1';
const DEFAULT_SETTINGS = { stationName: '车辆检测站', inspector: '张三' };

let settings = loadSettings();

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    return Object.assign({}, DEFAULT_SETTINGS, s);
  } catch (e) {
    return Object.assign({}, DEFAULT_SETTINGS);
  }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) { /* 设置很小，忽略写入失败 */ }
}

function applySettingsUI() {
  $('topStationName').textContent = settings.stationName;
  $('inspectorMeta').textContent = '预检员：' + settings.inspector + ' · ' + settings.stationName;
}

/* ---------- 记录 ---------- */
let records = loadRecords();
let currentPlatePhoto = null; // 车牌照片 dataURL（拍摄时裁剪方框区域）

function loadRecords() {
  try {
    const r = JSON.parse(localStorage.getItem(RECORDS_KEY));
    return Array.isArray(r) ? r : [];
  } catch (e) {
    return [];
  }
}

function saveRecords() {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch (e) {
    if (e && e.name === 'QuotaExceededError') {
      // 空间不足：只保留今日记录
      records = records.filter(function (r) { return isToday(r.createdAt); });
      try {
        localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
      } catch (e2) {
        alert('存储空间不足，本次记录将仅在当前页面保留。');
      }
    } else {
      alert('保存失败：' + (e && e.message ? e.message : '未知错误'));
    }
  }
}

function todayRecords() {
  return records
    .filter(function (r) { return isToday(r.createdAt); })
    .sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
}

function todayCount() { return todayRecords().length; }

function updateSeq() {
  $('seqDisplay').textContent = todayCount() + 1;
}

/* ---------- 表单 ---------- */
const plateInput = $('plateInput');
const plateError = $('plateError');

function plateValid(v) {
  return /^[\u4e00-\u9fa5][A-Z0-9]{4,7}$/.test(v);
}

function clearPlateError() {
  plateError.hidden = true;
  $('plateField').classList.remove('field-invalid');
}

function validateForm() {
  let ok = true;
  const plate = plateInput.value.trim().toUpperCase();
  if (!plateValid(plate)) {
    plateError.hidden = false;
    $('plateField').classList.add('field-invalid');
    ok = false;
  }
  return ok;
}

plateInput.addEventListener('input', function () {
  plateInput.value = plateInput.value.toUpperCase();
  clearPlateError();
});

function buildRecord() {
  const seq = todayCount() + 1;
  return {
    id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    seq: seq,
    plateNo: plateInput.value.trim().toUpperCase(),
    gearbox: $('gearboxInput').value,
    exhaust: $('exhaustInput').value,
    mileage: $('mileageInput').value.trim(),
    platePhoto: currentPlatePhoto,
    inspector: settings.inspector,
    stationName: settings.stationName,
    createdAt: new Date().toISOString()
  };
}

function resetForm() {
  $('form').reset();
  currentPlatePhoto = null;
  clearPlateError();
  updateSeq();
}

/* ---------- 预检单卡片生成（Canvas） ---------- */
const CARD_W = 750;
const PAD = 40;
const CONTENT_W = CARD_W - PAD * 2; // 670
const HEADER_H = 200;
const PLATE_BOX = { x: PAD, y: 140, w: CONTENT_W, h: 110 };
const PHOTO_W = CONTENT_W;
const PHOTO_H = 220; // 车牌照片约 4.6:1，完整显示
const INFO_GAP = 34;
const ROW_GAP = 22;
const CELL_W = (CONTENT_W - ROW_GAP) / 2; // 324
const LABEL_FS = 22;
const VALUE_FS = 28;
const ROW_BASE = 84;
const LINE_H = 38;
const FONT = '"PingFang SC","Microsoft YaHei",sans-serif';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function containDraw(ctx, img, x, y, w, h) {
  const scale = Math.min(w / img.width, h / img.height);
  const dw = Math.round(img.width * scale);
  const dh = Math.round(img.height * scale);
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

/* 文本按宽度换行，最多 maxLines 行 */
function textLines(ctx, text, maxWidth, maxLines) {
  const lines = [];
  let line = '';
  for (let i = 0; i < text.length; i++) {
    const test = line + text[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = text[i];
      if (maxLines && lines.length === maxLines) {
        // 已被截断，加省略号
        let last = lines[maxLines - 1];
        while (last && ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1);
        lines[maxLines - 1] = last + '…';
        return lines;
      }
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  if (maxLines && lines.length > maxLines) {
    lines.length = maxLines;
    let last = lines[maxLines - 1];
    while (last && ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = last + '…';
  }
  return lines;
}

/* 计算卡片布局（先用临时 ctx 测量，返回行信息与总高） */
function buildLayout(ctx, record, hasPhoto) {
  const fields = [
    ['变速器', record.gearbox || '—', false],
    ['排气管数量', record.exhaust || '—', false],
    ['行驶公里数', record.mileage ? record.mileage + ' km' : '—', false]
  ];
  const rows = [];
  ctx.font = '600 ' + VALUE_FS + 'px ' + FONT;
  for (let i = 0; i < fields.length; i += 2) {
    const left = fields[i];
    const right = fields[i + 1];
    const leftLines = textLines(ctx, left[1], CELL_W, left[2] ? 2 : 1);
    const rightLines = right ? textLines(ctx, right[1], CELL_W, right[2] ? 2 : 1) : [];
    const maxLines = Math.max(leftLines.length, rightLines.length);
    rows.push({
      left: left,
      right: right,
      leftLines: leftLines,
      rightLines: rightLines,
      h: ROW_BASE + (maxLines - 1) * LINE_H
    });
  }
  let y = PLATE_BOX.y + PLATE_BOX.h + INFO_GAP;
  if (hasPhoto) y += PHOTO_H + INFO_GAP;
  const rowYs = [];
  for (let i = 0; i < rows.length; i++) {
    rows[i].y = y;
    y += rows[i].h;
  }
  const footerTop = y + 40;
  const height = footerTop + 90;
  return { rows: rows, footerTop: footerTop, height: height };
}

function drawPlateText(ctx, plate, box) {
  const spacing = 6;
  const maxW = box.w - 60;
  let size = 64;
  function measure(s) {
    ctx.font = 'bold ' + s + 'px ' + FONT;
    let w = 0;
    for (let i = 0; i < plate.length; i++) w += ctx.measureText(plate[i]).width;
    return w + spacing * (plate.length - 1);
  }
  while (measure(size) > maxW && size > 34) size -= 2;
  ctx.font = 'bold ' + size + 'px ' + FONT;
  let total = 0;
  for (let i = 0; i < plate.length; i++) total += ctx.measureText(plate[i]).width;
  total += spacing * (plate.length - 1);
  let x = box.x + (box.w - total) / 2;
  const y = box.y + box.h / 2 + size * 0.36;
  ctx.fillStyle = '#1a3a5c';
  ctx.textAlign = 'left';
  for (let i = 0; i < plate.length; i++) {
    ctx.fillText(plate[i], x, y);
    x += ctx.measureText(plate[i]).width + spacing;
  }
}

function drawCell(ctx, field, lines, y, colIndex) {
  const x = PAD + colIndex * (CELL_W + ROW_GAP);
  ctx.font = '500 ' + LABEL_FS + 'px ' + FONT;
  ctx.fillStyle = '#7a8699';
  ctx.fillText(field[0], x, y + 24);
  ctx.font = '600 ' + VALUE_FS + 'px ' + FONT;
  ctx.fillStyle = '#16283a';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x, y + 28 + 30 + i * LINE_H);
  }
}

async function generateImage(record) {
  // 1. 载入车牌照片（可能为空）
  let photoImg = null;
  if (record.platePhoto) {
    try { photoImg = await loadImage(record.platePhoto); } catch (e) { photoImg = null; }
  }
  // 2. 测量布局
  const scratch = document.createElement('canvas');
  scratch.width = 1;
  scratch.height = 1;
  const sctx = scratch.getContext('2d');
  const layout = buildLayout(sctx, record, !!photoImg);
  // 3. 绘制
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W * dpr;
  canvas.height = layout.height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  // 背景
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, CARD_W, layout.height);

  // 头部渐变
  const grad = ctx.createLinearGradient(0, 0, 0, HEADER_H);
  grad.addColorStop(0, '#1a3a5c');
  grad.addColorStop(1, '#2c5f8a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CARD_W, HEADER_H);

  // 站名 + 副标题
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px ' + FONT;
  let stName = record.stationName || '车辆检测站';
  const stNameMax = CARD_W - PAD * 2 - 160;
  while (ctx.measureText(stName).width > stNameMax && stName.length > 1) stName = stName.slice(0, -1);
  ctx.fillText(stName, PAD, 54);
  ctx.font = '22px ' + FONT;
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText('车辆预检单', PAD, 92);

  // 序号徽章
  const seqText = '序号 ' + String(record.seq || 1).padStart(3, '0');
  ctx.font = 'bold 22px ' + FONT;
  const bw = ctx.measureText(seqText).width + 30;
  const bx = CARD_W - PAD - bw;
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  roundRect(ctx, bx, 36, bw, 44, 22);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  roundRect(ctx, bx, 36, bw, 44, 22);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(seqText, bx + bw / 2, 64);

  // 车牌框
  const pb = PLATE_BOX;
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(15,40,70,0.35)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  roundRect(ctx, pb.x, pb.y, pb.w, pb.h, 16);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  drawPlateText(ctx, (record.plateNo || '').toUpperCase(), pb);

  // 车牌照片
  if (photoImg) {
    const py = PLATE_BOX.y + PLATE_BOX.h + INFO_GAP;
    ctx.save();
    roundRect(ctx, PAD, py, PHOTO_W, PHOTO_H, 16);
    ctx.clip();
    containDraw(ctx, photoImg, PAD, py, PHOTO_W, PHOTO_H);
    ctx.restore();
  }

  // 信息区分隔线 + 行
  ctx.fillStyle = '#d7e0ea';
  ctx.fillRect(PAD, layout.rows[0].y - 16, CONTENT_W, 1);
  ctx.textAlign = 'left';
  for (let i = 0; i < layout.rows.length; i++) {
    const row = layout.rows[i];
    drawCell(ctx, row.left, row.leftLines, row.y, 0);
    if (row.right) drawCell(ctx, row.right, row.rightLines, row.y, 1);
  }

  // 页脚
  const ft = layout.footerTop;
  ctx.strokeStyle = '#2c5f8a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, ft);
  ctx.lineTo(CARD_W - PAD, ft);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.font = '500 22px ' + FONT;
  ctx.fillStyle = '#55607a';
  const infoLine = (record.inspector || '') + ' · ' + formatDateTime(record.createdAt) + ' · 序号 ' + String(record.seq || 1).padStart(3, '0');
  ctx.fillText(infoLine, CARD_W / 2, ft + 32);
  ctx.font = '18px ' + FONT;
  ctx.fillStyle = '#8a94a6';
  ctx.fillText(record.stationName || '车辆检测站', CARD_W / 2, ft + 58);

  return canvas.toDataURL('image/png');
}

/* ---------- 提交生成 ---------- */
$('form').addEventListener('submit', async function (e) {
  e.preventDefault();
  if (!validateForm()) return;
  const record = buildRecord();
  const btn = $('generateBtn');
  btn.disabled = true;
  btn.textContent = '生成中…';
  try {
    const dataUrl = await generateImage(record);
    records.unshift(record);
    saveRecords();
    updateSeq();
    showPreview(dataUrl, record);
  } catch (err) {
    alert('生成失败：' + (err && err.message ? err.message : '未知错误'));
  } finally {
    btn.disabled = false;
    btn.textContent = '生成预检单';
  }
});

/* ---------- 预览弹窗 ---------- */
let lastCardFile = null;

function showPreview(dataUrl, record) {
  $('previewImg').src = dataUrl;
  const save = $('saveBtn');
  save.href = dataUrl;
  save.download = '预检单_' + (record.plateNo || '') + '.png';
  $('shareTip').hidden = true;
  try {
    fetch(dataUrl).then(function (r) { return r.blob(); }).then(function (blob) {
      lastCardFile = new File([blob], save.download, { type: 'image/png' });
    }).catch(function () { lastCardFile = null; });
  } catch (e) { lastCardFile = null; }
  $('previewModal').hidden = false;
}

/* 分享：优先系统分享面板（可勾选微信），微信内则引导长按发送 */
$('shareBtn').addEventListener('click', function () {
  const isWechat = /MicroMessenger/i.test(navigator.userAgent);
  if (!isWechat && navigator.share && navigator.canShare && lastCardFile &&
      navigator.canShare({ files: [lastCardFile] })) {
    navigator.share({ files: [lastCardFile], title: '车辆预检单' }).catch(function () {});
    return;
  }
  const tip = $('shareTip');
  tip.textContent = isWechat
    ? '① 长按上方卡片图片　② 选择「发送给朋友」　③ 选择微信群聊'
    : '当前浏览器不支持直接分享，请点「保存图片」存入相册后，再到微信中发送给群聊';
  tip.hidden = false;
});

$('againBtn').addEventListener('click', function () {
  $('previewModal').hidden = true;
  resetForm();
  plateInput.focus();
});

$('doneBtn').addEventListener('click', function () {
  $('previewModal').hidden = true;
  switchTab('records');
});

$('previewClose').addEventListener('click', function () {
  $('previewModal').hidden = true;
});

$('previewModal').addEventListener('click', function (e) {
  if (e.target === this) this.hidden = true;
});

/* ---------- 设置 ---------- */
$('settingsBtn').addEventListener('click', function () {
  $('stationNameInput').value = settings.stationName;
  $('inspectorInput').value = settings.inspector;
  $('settingsModal').hidden = false;
});

$('settingsSave').addEventListener('click', function () {
  settings.stationName = $('stationNameInput').value.trim() || DEFAULT_SETTINGS.stationName;
  settings.inspector = $('inspectorInput').value.trim() || DEFAULT_SETTINGS.inspector;
  saveSettings();
  applySettingsUI();
  $('settingsModal').hidden = true;
});

$('settingsClose').addEventListener('click', function () {
  $('settingsModal').hidden = true;
});

$('settingsModal').addEventListener('click', function (e) {
  if (e.target === this) this.hidden = true;
});

/* ---------- 确认框 ---------- */
let pendingConfirm = null;

function askConfirm(msg, fn) {
  $('confirmMsg').textContent = msg;
  pendingConfirm = fn;
  $('confirmModal').hidden = false;
}

$('confirmOk').addEventListener('click', function () {
  const fn = pendingConfirm;
  pendingConfirm = null;
  $('confirmModal').hidden = true;
  if (fn) fn();
});

$('confirmCancel').addEventListener('click', function () {
  pendingConfirm = null;
  $('confirmModal').hidden = true;
});

$('confirmModal').addEventListener('click', function (e) {
  if (e.target === this) {
    pendingConfirm = null;
    this.hidden = true;
  }
});

/* ---------- 今日记录 ---------- */
function renderRecords() {
  const list = todayRecords();
  $('listCount').textContent = '今日 ' + list.length + ' 台';
  $('emptyState').hidden = list.length > 0;
  const box = $('recordList');
  box.innerHTML = '';
  list.forEach(function (item) {
    const el = document.createElement('div');
    el.className = 'record-item';

    const info = document.createElement('div');
    info.className = 'record-info';

    const top = document.createElement('div');
    top.className = 'record-top';
    const plate = document.createElement('span');
    plate.className = 'record-plate';
    plate.textContent = item.plateNo;
    const seq = document.createElement('span');
    seq.className = 'record-seq';
    seq.textContent = '序号 ' + String(item.seq).padStart(3, '0');
    top.appendChild(plate);
    top.appendChild(seq);

    const sub = document.createElement('div');
    sub.className = 'record-sub';
    sub.textContent = ['变速器：' + (item.gearbox || '—'), '排气管：' + (item.exhaust || '—'), '公里数：' + (item.mileage || '—')].join(' · ');

    const time = document.createElement('div');
    time.className = 'record-time';
    time.textContent = formatTime(item.createdAt);

    info.appendChild(top);
    info.appendChild(sub);
    info.appendChild(time);

    const del = document.createElement('button');
    del.className = 'record-del';
    del.textContent = '删除';
    del.addEventListener('click', function (e) {
      e.stopPropagation();
      askConfirm('确定删除 ' + item.plateNo + ' 这条记录吗？', function () {
        records = records.filter(function (r) { return r.id !== item.id; });
        saveRecords();
        renderRecords();
        updateSeq();
      });
    });

    el.appendChild(info);
    el.appendChild(del);
    el.addEventListener('click', async function () {
      try {
        const d = await generateImage(item);
        showPreview(d, item);
      } catch (err) {
        alert('生成失败：' + (err && err.message ? err.message : '未知错误'));
      }
    });
    box.appendChild(el);
  });
}

$('exportBtn').addEventListener('click', exportCSV);

function csvEscape(s) {
  const str = String(s == null ? '' : s);
  if (/[",\n\r]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
  return str;
}

function exportCSV() {
  const list = todayRecords();
  const header = ['序号', '登记时间', '车牌号', '变速器', '排气管数量', '行驶公里数', '预检员'];
  const rows = list.map(function (r) {
    return [
      r.seq, formatDateTime(r.createdAt), r.plateNo,
      r.gearbox || '', r.exhaust || '', r.mileage || '', r.inspector || ''
    ];
  });
  const csv = '\uFEFF' + [header].concat(rows).map(function (row) {
    return row.map(csvEscape).join(',');
  }).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '预检记录_' + todayStr() + '.csv';
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  a.remove();
}

$('clearBtn').addEventListener('click', function () {
  askConfirm('确定清空今日全部记录吗？此操作不可恢复。', function () {
    records = records.filter(function (r) { return !isToday(r.createdAt); });
    saveRecords();
    renderRecords();
    updateSeq();
  });
});

/* ---------- Tab 切换 ---------- */
function switchTab(name) {
  const isInput = name === 'input';
  $('pageInput').hidden = !isInput;
  $('pageRecords').hidden = isInput;
  document.querySelectorAll('.tab-btn').forEach(function (b) {
    b.classList.toggle('active', b.dataset.tab === name);
  });
  if (!isInput) renderRecords();
}

document.querySelectorAll('.tab-btn').forEach(function (btn) {
  btn.addEventListener('click', function () { switchTab(btn.dataset.tab); });
});

/* ============================================================
 * 车牌照片拍摄（方框取景，拍照预览，不做识别）
 * ============================================================ */
let ocrStream = null;
let ocrBusy = false;
let ocrClosed = true;
let ocrMode = 'none'; // 'camera' | 'photo'

function setOcrStatus(msg) {
  $('ocrStatus').textContent = msg;
}

/* 把屏幕上取景框的位置换算成视频源像素坐标 */
function getGuideRect() {
  const video = $('ocrVideo');
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const cw = video.clientWidth;
  const ch = video.clientHeight;
  if (!vw || !vh || !cw || !ch) return null;
  const scale = Math.max(cw / vw, ch / vh);
  const offX = (cw - vw * scale) / 2;
  const offY = (ch - vh * scale) / 2;
  const gr = $('ocrGuide').getBoundingClientRect();
  const vr = video.getBoundingClientRect();
  return {
    x: (gr.left - vr.left - offX) / scale,
    y: (gr.top - vr.top - offY) / scale,
    w: gr.width / scale,
    h: gr.height / scale
  };
}

function captureVideoFrame() {
  const video = $('ocrVideo');
  const c = document.createElement('canvas');
  c.width = video.videoWidth || 640;
  c.height = video.videoHeight || 480;
  c.getContext('2d').drawImage(video, 0, 0);
  return c;
}

function stopStream() {
  if (ocrStream) {
    ocrStream.getTracks().forEach(function (t) { t.stop(); });
    ocrStream = null;
  }
  $('ocrVideo').srcObject = null;
}

/* 裁剪方框区域并等比放大，返回压缩后的 dataURL */
function cropPlatePhoto(source, rect) {
  const x = Math.max(0, Math.round(rect.x));
  const y = Math.max(0, Math.round(rect.y));
  const w = Math.min(Math.round(rect.w), source.width - x);
  const h = Math.min(Math.round(rect.h), source.height - y);
  const c = document.createElement('canvas');
  const targetW = 800;
  c.width = targetW;
  c.height = Math.max(1, Math.round(targetW * h / w));
  const ctx = c.getContext('2d');
  ctx.drawImage(source, x, y, w, h, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.8);
}

function showOcrShot(dataUrl) {
  currentPlatePhoto = dataUrl;
  $('ocrShot').src = dataUrl;
  $('ocrVideoWrap').hidden = true;
  $('ocrShotWrap').hidden = false;
  $('ocrResultRow').hidden = false;
  $('ocrPhotoBtn').hidden = true;
  $('ocrAlbumBtn').hidden = true;
  setOcrStatus('已拍摄，请按照片填写车牌号');
  $('ocrResult').focus();
}

function showOcrFallback(msg) {
  ocrMode = 'photo';
  $('ocrFallbackMsg').textContent = msg;
  $('ocrFallback').hidden = false;
  $('ocrAlbumBtn').hidden = false;
  setOcrStatus('');
}

function openOcrModal() {
  ocrClosed = false;
  ocrBusy = false;
  stopStream();
  $('ocrResultRow').hidden = true;
  $('ocrShotWrap').hidden = true;
  $('ocrFallback').hidden = true;
  $('ocrPhotoBtn').hidden = true;
  $('ocrAlbumBtn').hidden = true;
  $('ocrResult').value = '';
  setOcrStatus('请将车牌对准方框，点击拍照');
  $('ocrModal').hidden = false;

  const canCamera = window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
  if (!canCamera) {
    showOcrFallback('当前环境无法调用摄像头（需 https 或 localhost）。请从相册选择车牌照片：');
    return;
  }
  navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
  }).then(function (stream) {
    if (ocrClosed) {
      stream.getTracks().forEach(function (t) { t.stop(); });
      return;
    }
    ocrStream = stream;
    $('ocrVideo').srcObject = stream;
    return $('ocrVideo').play();
  }).then(function () {
    if (ocrClosed) return;
    ocrMode = 'camera';
    $('ocrVideoWrap').hidden = false;
    $('ocrPhotoBtn').hidden = false;
    setOcrStatus('请将车牌对准方框，点击拍照');
  }).catch(function (err) {
    showOcrFallback('无法调用摄像头（' + (err && err.message ? err.message : '设备不可用') + '）。请从相册选择车牌照片：');
  });
}

function closeModalOcr() {
  ocrClosed = true;
  ocrBusy = false;
  stopStream();
  $('ocrModal').hidden = true;
}

$('ocrBtn').addEventListener('click', openOcrModal);
$('ocrCancelBtn').addEventListener('click', closeModalOcr);
$('ocrModal').addEventListener('click', function (e) {
  if (e.target === this) closeModalOcr();
});

/* 拍照：截取当前帧并按方框裁剪 */
$('ocrPhotoBtn').addEventListener('click', function () {
  if (ocrBusy) return;
  ocrBusy = true;
  try {
    const rect = getGuideRect();
    const frame = captureVideoFrame();
    let dataUrl;
    if (rect && rect.w > 4 && rect.h > 4) {
      dataUrl = cropPlatePhoto(frame, rect);
    } else {
      dataUrl = frame.toDataURL('image/jpeg', 0.8);
    }
    showOcrShot(dataUrl);
    stopStream();
  } finally {
    ocrBusy = false;
  }
});

/* 相册选图 */
$('ocrAlbumBtn').addEventListener('click', function () {
  $('ocrAlbumInput').click();
});

$('ocrAlbumInput').addEventListener('change', function () {
  const file = this.files[0];
  this.value = '';
  if (!file || ocrBusy) return;
  ocrBusy = true;
  setOcrStatus('正在读取照片…');
  const url = URL.createObjectURL(file);
  loadImage(url).then(function (img) {
    URL.revokeObjectURL(url);
    const maxW = 1200;
    const w = Math.min(img.width, maxW);
    const h = Math.round(img.height * w / img.width);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    $('ocrFallback').hidden = true;
    showOcrShot(c.toDataURL('image/jpeg', 0.8));
  }).catch(function () {
    URL.revokeObjectURL(url);
    setOcrStatus('照片读取失败，请重试');
  }).finally(function () {
    ocrBusy = false;
  });
});

/* 重拍 */
$('ocrRetryBtn').addEventListener('click', function () {
  $('ocrResultRow').hidden = true;
  $('ocrShotWrap').hidden = true;
  currentPlatePhoto = null;
  openOcrModal();
});

/* 确认填写 */
$('ocrConfirmBtn').addEventListener('click', function () {
  const val = $('ocrResult').value.trim().toUpperCase();
  if (!val) return;
  plateInput.value = val;
  clearPlateError();
  closeModalOcr();
});

/* ---------- 初始化 ---------- */
applySettingsUI();
updateSeq();
