/**
 * ПлатиЛегко! — отдельная Admin Mini App
 */
const API_BASE = "http://127.0.0.1:8000";
/** Должен совпадать с ADMIN_ID в backend/.env */
const ADMIN_ID = 1377253285;

const tg = window.Telegram?.WebApp;

function showToast(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    el.hidden = true;
  }, 2200);
}

function getUserId() {
  return tg?.initDataUnsafe?.user?.id || 0;
}

function formatMoney(v) {
  return `${Number(v || 0).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`;
}

async function loadStats(adminId) {
  try {
    const res = await fetch(
      `${API_BASE}/api/admin/stats?admin_id=${adminId}`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    document.getElementById("s-users").textContent = String(data.users ?? 0);
    document.getElementById("s-tasks").textContent = String(data.active_tasks ?? 0);
    document.getElementById("s-tx").textContent = String(data.transactions ?? 0);
    document.getElementById("s-bal").textContent = formatMoney(data.total_balances);
  } catch (e) {
    console.warn(e);
    document.getElementById("s-users").textContent = "—";
    document.getElementById("s-tasks").textContent = "—";
    document.getElementById("s-tx").textContent = "—";
    document.getElementById("s-bal").textContent = "офлайн";
  }
}

function init() {
  if (tg) {
    tg.ready();
    tg.expand();
    try {
      tg.setHeaderColor("secondary_bg_color");
      tg.setBackgroundColor("bg_color");
    } catch (_) {
      /* ignore */
    }
  }

  const uid = getUserId();
  const badge = document.getElementById("access-badge");
  const denied = document.getElementById("denied");
  const panel = document.getElementById("panel");

  // В Telegram только ADMIN_ID; без user (превью в браузере) — UI доступен
  if (uid && uid !== ADMIN_ID) {
    badge.textContent = "Нет доступа";
    badge.classList.add("admin-badge--no");
    denied.hidden = false;
    panel.hidden = true;
    return;
  }

  badge.textContent = "Admin";
  badge.classList.add("admin-badge--ok");
  denied.hidden = true;
  panel.hidden = false;

  const adminId = uid || ADMIN_ID;
  loadStats(adminId);

  document.querySelectorAll(".menu-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      showToast("Раздел в разработке — добавим позже");
    });
  });
}

document.addEventListener("DOMContentLoaded", init);
