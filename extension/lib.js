// lib.js — تخزين القوالب وتشغيل المحرك على التبويب (مشترك بين النافذة المنبثقة والخلفية وصفحة الإدارة)
import { hadirEngine } from './engine.js';

// ---------- التخزين ----------
export async function getAll() {
  const r = await chrome.storage.local.get(['templates', 'settings']);
  return {
    templates: Array.isArray(r.templates) ? r.templates : [],
    settings: Object.assign({ skipFilled: false, lastTemplateId: null, flashCapture: true }, r.settings || {}),
  };
}
export async function saveTemplates(templates) { await chrome.storage.local.set({ templates }); }
export async function saveSettings(settings) { await chrome.storage.local.set({ settings }); }

export const uid = (p = 't') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export async function upsertTemplate(t) {
  const { templates } = await getAll();
  const i = templates.findIndex((x) => x.id === t.id);
  t.updated = Date.now();
  if (i >= 0) templates[i] = t; else templates.unshift(t);
  await saveTemplates(templates);
  return t;
}

// ---------- المتغيرات ----------
const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const pad = (n) => String(n).padStart(2, '0');

export const VARIABLES = [
  { key: '{{التاريخ}}', desc: 'تاريخ اليوم 29/09/2026' },
  { key: '{{اليوم}}', desc: 'اسم اليوم: الثلاثاء' },
  { key: '{{الهجري}}', desc: 'التاريخ الهجري' },
  { key: '{{التاريخ_ISO}}', desc: 'بصيغة 2026-09-29' },
];

export function resolveVars(v, now = new Date()) {
  if (typeof v !== 'string' || !v.includes('{{')) return v;
  let hijri = '';
  try {
    hijri = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }).format(now);
  } catch (e) {}
  return v
    .replace(/\{\{\s*التاريخ\s*\}\}/g, `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`)
    .replace(/\{\{\s*التاريخ_ISO\s*\}\}/g, `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`)
    .replace(/\{\{\s*اليوم\s*\}\}/g, DAYS[now.getDay()])
    .replace(/\{\{\s*الهجري\s*\}\}/g, hijri);
}

// ---------- التشغيل على التبويب ----------
async function exec(tabId, action, payload) {
  const res = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    world: 'MAIN',
    func: hadirEngine,
    args: [action, payload || {}],
  });
  return res.map((r) => r.result).filter((r) => r && !r.skipFrame);
}

export function canRunOn(url) {
  return /^(https?|file):/i.test(url || '') && !/^https:\/\/chrome\.google\.com\/webstore|^https:\/\/chromewebstore\.google\.com/i.test(url);
}

export async function scanTab(tabId) {
  const parts = await exec(tabId, 'scan');
  return parts.reduce((a, p) => ({ count: a.count + (p.count || 0), filled: a.filled + (p.filled || 0) }), { count: 0, filled: 0 });
}

export async function captureTab(tabId) {
  const parts = await exec(tabId, 'capture', { flash: true });
  const fields = [];
  let n = 0;
  parts.forEach((p) => (p.fields || []).forEach((f) => { f.fid = 'f' + (++n); f.enabled = true; fields.push(f); }));
  return { fields, title: (parts.find((p) => p.title) || {}).title || '', url: (parts[0] || {}).url || '' };
}

export async function fillTab(tabId, template, opts = {}) {
  const now = new Date();
  const fields = (template.fields || [])
    .filter((f) => f.enabled !== false)
    .map((f) => Object.assign({}, f, { value: resolveVars(f.value, now) }));
  const first = await exec(tabId, 'fill', { fields, skipFilled: !!opts.skipFilled });
  const frames = new Set();
  const done = new Set();
  let skipped = 0, failed = 0;
  first.forEach((p) => {
    (p.frames || []).forEach((k) => frames.add(k));
    (p.filled || []).forEach((id) => done.add(id));
    skipped += (p.skipped || []).length;
    failed += (p.failed || []).length;
  });
  // حقول إطارات غير موجودة الآن (تغيّر مسار الإطار مثلًا) — محاولة ثانية في أي إطار
  const orphans = fields.filter((f) => !frames.has(f.frame) && !done.has(f.fid));
  if (orphans.length) {
    const second = await exec(tabId, 'fill', { fields: orphans, skipFilled: !!opts.skipFilled, anyFrame: true });
    second.forEach((p) => {
      (p.filled || []).forEach((id) => done.add(id));
      skipped += (p.skipped || []).length;
    });
  }
  // تحديث إحصاءات الاستخدام
  const all = await getAll();
  const t = all.templates.find((x) => x.id === template.id);
  if (t) { t.lastUsed = Date.now(); t.uses = (t.uses || 0) + 1; await saveTemplates(all.templates); }
  all.settings.lastTemplateId = template.id;
  all.settings.lastKind = 'template';
  await saveSettings(all.settings);
  return { filled: done.size, total: fields.length, skipped, missing: fields.length - done.size - skipped };
}

// ---------- وصف الحقول للعرض ----------
export function fieldPreview(f) {
  const v = f.value;
  if (f.kind === 'check' || f.kind === 'radio') return v ? '✔ محدد' : '✘ غير محدد';
  if (f.kind === 'select') return Array.isArray(v) ? v.map((x) => x.t).join('، ') : (v && v.t) || '';
  if (f.kind === 'rich') { const d = document.createElement('div'); d.innerHTML = v; return d.textContent; }
  return String(v || '');
}

export const KIND_NAMES = { text: 'نص', rich: 'نص منسّق', select: 'قائمة', check: 'مربع اختيار', radio: 'خيار' };
