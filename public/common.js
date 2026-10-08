export const socket = io();
export const $ = (s, root=document) => root.querySelector(s);
export const $$ = (s, root=document) => [...root.querySelectorAll(s)];

export async function api(url, options={}) {
  const { headers = {}, ...rest } = options;
  const res = await fetch(url, {
    ...rest,
    headers: { "Content-Type": "application/json", ...headers }
  });
  const data = res.status === 204 ? null : await res.json().catch(()=>null);
  if (!res.ok) throw new Error(data?.error || `Ошибка запроса (${res.status})`);
  return data;
}
export function escapeHtml(value="") {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
export function fmtPct(value) { return Math.round(Number(value || 0) * 100) + "%"; }
export function wordmark(label="") {
  return `<span class="wordmark"><span class="wordmark-main">ПИВОФЭКТОРИ</span>${label?`<span class="wordmark-sub">/ ${label}</span>`:""}</span>`;
}
export function hideSplash() {
  const splash = document.querySelector("#splash");
  if (!splash) return;
  splash.classList.add("is-hidden");
  setTimeout(()=>splash.remove(),50);
}
export function setBusy(button,busy,label="Загрузка…") {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = label;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.label || button.textContent;
    button.disabled = false;
  }
}
