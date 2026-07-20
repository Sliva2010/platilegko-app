/**
 * ПлатиЛегко! Mini App
 *
 * API_BASE: локальный backend. Для работы из GitHub Pages подставьте URL ngrok, например:
 *   const API_BASE = "https://xxxx.ngrok-free.app";
 */
const API_BASE = "http://127.0.0.1:8000";

const DEMO_TASKS = [
  {
    id: 1,
    title: "Подписаться на канал",
    description: "Подпишитесь на официальный канал проекта и подтвердите подписку.",
    reward: 15,
  },
  {
    id: 2,
    title: "Пригласить друга",
    description: "Пригласите друга по реферальной ссылке. Награда после его первого входа.",
    reward: 50,
  },
  {
    id: 3,
    title: "Оставить отзыв",
    description: "Напишите короткий отзыв о сервисе в комментариях бота.",
    reward: 25,
  },
  {
    id: 4,
    title: "Заполнить профиль",
    description: "Укажите имя и username в Telegram — задание для новых пользователей.",
    reward: 10,
  },
  {
    id: 5,
    title: "Ежедневный вход",
    description: "Откройте Mini App сегодня. Бонус за активность.",
    reward: 5,
  },
];

const state = {
  user: null,
  tasks: [],
  selectedTask: null,
};

const tg = window.Telegram?.WebApp;

function formatMoney(value) {
  const n = Number(value) || 0;
  return `${n.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`;
}

function showToast(message, ms = 2400) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    el.hidden = true;
  }, ms);
}

function applyTelegramTheme() {
  if (!tg) return;
  const p = tg.themeParams || {};
  const root = document.documentElement;
  if (p.bg_color) root.style.setProperty("--tg-theme-bg-color", p.bg_color);
  if (p.text_color) root.style.setProperty("--tg-theme-text-color", p.text_color);
  if (p.hint_color) root.style.setProperty("--tg-theme-hint-color", p.hint_color);
  if (p.link_color) root.style.setProperty("--tg-theme-link-color", p.link_color);
  if (p.button_color) root.style.setProperty("--tg-theme-button-color", p.button_color);
  if (p.button_text_color) {
    root.style.setProperty("--tg-theme-button-text-color", p.button_text_color);
  }
  if (p.secondary_bg_color) {
    root.style.setProperty("--tg-theme-secondary-bg-color", p.secondary_bg_color);
  }
}

function getTelegramUser() {
  const u = tg?.initDataUnsafe?.user;
  if (u) {
    return {
      user_id: u.id,
      username: u.username || null,
      first_name: u.first_name || "Пользователь",
      last_name: u.last_name || "",
    };
  }
  // Browser preview fallback
  return {
    user_id: 0,
    username: "preview",
    first_name: "Гость",
    last_name: "",
  };
}

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("tab--active", tab.dataset.tab === name);
  });
  document.querySelectorAll(".nav__item").forEach((btn) => {
    btn.classList.toggle("nav__item--active", btn.dataset.nav === name);
  });
  if (tg?.HapticFeedback?.selectionChanged) {
    try {
      tg.HapticFeedback.selectionChanged();
    } catch (_) {
      /* ignore */
    }
  }
}

function renderUser(user) {
  state.user = user;
  const balance = formatMoney(user.balance ?? 0);
  const name = user.first_name || "Гость";
  const username = user.username ? `@${user.username}` : "@—";
  const letter = (name[0] || "?").toUpperCase();

  const set = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  set("header-balance-value", balance);
  set("wallet-balance", balance);
  set("profile-name", name);
  set("profile-username", username);
  set("profile-id", `ID: ${user.user_id ?? "—"}`);
  set("profile-avatar", letter);
  set("stat-balance", balance);
  set("stat-tasks", String(user.tasks_completed ?? 0));
}

function renderTasks(tasks) {
  state.tasks = tasks;
  const list = document.getElementById("tasks-list");
  if (!list) return;

  if (!tasks.length) {
    list.innerHTML = `<p class="muted empty-state">Заданий пока нет</p>`;
    return;
  }

  list.innerHTML = tasks
    .map(
      (t) => `
      <button type="button" class="task-card" data-task-id="${t.id}">
        <div class="task-card__icon">💼</div>
        <div class="task-card__body">
          <div class="task-card__title">${escapeHtml(t.title)}</div>
          <div class="task-card__desc">${escapeHtml(t.description || "")}</div>
        </div>
        <div class="task-card__reward">+${formatMoney(t.reward)}</div>
      </button>
    `
    )
    .join("");

  list.querySelectorAll(".task-card").forEach((card) => {
    card.addEventListener("click", () => {
      const id = Number(card.dataset.taskId);
      const task = state.tasks.find((x) => Number(x.id) === id);
      if (task) openTaskModal(task);
    });
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function openTaskModal(task) {
  state.selectedTask = task;
  document.getElementById("modal-title").textContent = task.title;
  document.getElementById("modal-desc").textContent = task.description || "";
  document.getElementById("modal-reward").textContent = `+${formatMoney(task.reward)}`;
  const modal = document.getElementById("task-modal");
  modal.hidden = false;
  if (tg?.HapticFeedback?.impactOccurred) {
    try {
      tg.HapticFeedback.impactOccurred("light");
    } catch (_) {
      /* ignore */
    }
  }
}

function closeTaskModal() {
  document.getElementById("task-modal").hidden = true;
  state.selectedTask = null;
}

function bindNav() {
  document.querySelectorAll(".nav__item").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.nav));
  });
}

function bindModal() {
  document.querySelectorAll("[data-close-modal]").forEach((el) => {
    el.addEventListener("click", closeTaskModal);
  });

  // Stub buttons — logic later
  document.getElementById("btn-do-task")?.addEventListener("click", () => {
    showToast("«Выполнить» — скоро подключим");
    if (tg?.HapticFeedback?.notificationOccurred) {
      try {
        tg.HapticFeedback.notificationOccurred("warning");
      } catch (_) {
        /* ignore */
      }
    }
  });

  document.getElementById("btn-check-task")?.addEventListener("click", () => {
    showToast("«Проверить» — скоро подключим");
    if (tg?.HapticFeedback?.notificationOccurred) {
      try {
        tg.HapticFeedback.notificationOccurred("warning");
      } catch (_) {
        /* ignore */
      }
    }
  });
}

async function loadData() {
  const tgUser = getTelegramUser();

  // Profile from Telegram immediately
  renderUser({
    user_id: tgUser.user_id,
    username: tgUser.username,
    first_name: tgUser.first_name,
    balance: 0,
    tasks_completed: 0,
  });

  try {
    const tasksRes = await apiGet("/api/tasks");
    renderTasks(tasksRes.tasks || []);
  } catch (e) {
    console.warn("API tasks unavailable, using demo data", e);
    renderTasks(DEMO_TASKS);
    showToast("Офлайн-режим: демо-задания");
  }

  if (tgUser.user_id) {
    try {
      const userRes = await apiGet(`/api/user/${tgUser.user_id}`);
      renderUser({
        ...userRes,
        first_name: userRes.first_name || tgUser.first_name,
        username: userRes.username || tgUser.username,
      });
    } catch (e) {
      console.warn("API user unavailable", e);
    }
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
      /* older clients */
    }
    applyTelegramTheme();
  }

  bindNav();
  bindModal();
  loadData();
}

document.addEventListener("DOMContentLoaded", init);
