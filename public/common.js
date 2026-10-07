export const socket = io();
export const $ = (s, root=document) => root.querySelector(s);
export const $$ = (s, root=document) => [...root.querySelectorAll(s)];
export async function api(url, options={}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers||{}) },
    ...options
  });
  const data = res.status === 204 ? null : await res.json().catch(()=>null);
  if (!res.ok) throw new Error(data?.error || "Ошибка запроса");
  return data;
}
export function escapeHtml(value="") {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
export function fmtPct(value) { return Math.round(value * 100) + "%"; }
