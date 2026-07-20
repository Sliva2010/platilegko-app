/**
 * ПлатиЛегко! Mini App
 * Для GitHub Pages + локальный API: подставьте ngrok в API_BASE.
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
    description: "Пригласите друга по реферальной ссылке.",
    reward: 50,
  },
  {
    id: 3,
    title: "Оставить отзыв",
    description: "Напишите короткий отзыв о сервисе.",
    reward: 25,
  },
  {
    id: 4,
    title: "Заполнить профиль",
    description: "Укажите имя и username в Telegram.",
    reward: 10,
  },
  {
    id: 5,
    title: "Ежедневный вход",
    description: "Откройте Mini App сегодня.",
    reward: 5,
  },
];

const TASK_ICON_SVG = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
  <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
</svg>`;

const state = {
  user: null,
  tasks: [],
  selectedTask: null,
  referrals: [],
  photoUrl: null,
};

const tg = window.Telegram?.WebApp;

function formatMoney(value) {
  const n = Number(value) || 0;
  return `${n.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`;
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
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

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function applyTelegramTheme() {
  if (!tg) return;
  const p = tg.themeParams || {};
  const root = document.documentElement;
  const map = {
    bg_color: "--tg-theme-bg-color",
    text_color: "--tg-theme-text-color",
    hint_color: "--tg-theme-hint-color",
    link_color: "--tg-theme-link-color",
    button_color: "--tg-theme-button-color",
    button_text_color: "--tg-theme-button-text-color",
    secondary_bg_color: "--tg-theme-secondary-bg-color",
  };
  Object.entries(map).forEach(([k, cssVar]) => {
    if (p[k]) root.style.setProperty(cssVar, p[k]);
  });
}

function getTelegramUser() {
  const u = tg?.initDataUnsafe?.user;
  if (u) {
    return {
      user_id: u.id,
      username: u.username || null,
      first_name: u.first_name || "Пользователь",
      last_name: u.last_name || "",
      photo_url: u.photo_url || null,
    };
  }
  return {
    user_id: 0,
    username: "preview",
    first_name: "Гость",
    last_name: "",
    photo_url: null,
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
  try {
    tg?.HapticFeedback?.selectionChanged?.();
  } catch (_) {
    /* ignore */
  }
  if (name === "wallet") loadTransactions();
  if (name === "friends") loadReferrals();
}

function setAvatar(photoUrl, fallbackLetter) {
  const img = document.getElementById("profile-avatar-img");
  const fb = document.getElementById("profile-avatar-fallback");
  if (!img || !fb) return;

  const letter = (fallbackLetter || "?").toUpperCase();
  fb.textContent = letter;

  if (!photoUrl) {
    img.hidden = true;
    img.removeAttribute("src");
    fb.hidden = false;
    return;
  }

  img.onload = () => {
    img.hidden = false;
    fb.hidden = true;
  };
  img.onerror = () => {
    img.hidden = true;
    fb.hidden = false;
  };
  img.src = photoUrl;
}

function resolvePhotoUrl(tgUser, userId) {
  if (tgUser.photo_url) return tgUser.photo_url;
  if (userId) return `${API_BASE}/api/user/${userId}/photo`;
  return null;
}

function renderUser(user, tgUser) {
  state.user = user;
  const balance = formatMoney(user.balance ?? 0);
  const name = user.first_name || tgUser?.first_name || "Гость";
  const username = user.username
    ? `@${user.username}`
    : tgUser?.username
      ? `@${tgUser.username}`
      : "@—";
  const refs = user.referrals_count ?? 0;
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
  set("stat-balance", balance);
  set("stat-tasks", String(user.tasks_completed ?? 0));
  set("stat-refs", String(refs));
  set("wallet-tasks", String(user.tasks_completed ?? 0));
  set("wallet-refs", String(refs));
  set("ref-count", String(refs));
  set("ref-earned", formatMoney(refs * (user.referral_bonus ?? 10)));
  if (user.referral_bonus != null) {
    set("ref-bonus", `+${formatMoney(user.referral_bonus)}`);
  }

  const linkInput = document.getElementById("ref-link");
  if (linkInput) {
    linkInput.value = user.referral_link || "Ссылка появится после /start в боте";
  }

  const photo = resolvePhotoUrl(tgUser || getTelegramUser(), user.user_id);
  state.photoUrl = photo;
  setAvatar(photo, letter);
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
        <div class="task-card__icon">${TASK_ICON_SVG}</div>
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

function renderFriends(list) {
  const box = document.getElementById("friends-list");
  if (!box) return;
  if (!list.length) {
    box.innerHTML = `<p class="muted empty-state">Пока никого нет — отправьте ссылку</p>`;
    return;
  }
  box.innerHTML = list
    .map((f) => {
      const name = f.first_name || "Пользователь";
      const un = f.username ? `@${f.username}` : `ID ${f.user_id}`;
      const letter = (name[0] || "?").toUpperCase();
      return `
        <div class="friend-row">
          <div class="avatar avatar--sm">
            <span class="avatar__fallback">${letter}</span>
          </div>
          <div>
            <div class="friend-row__name">${escapeHtml(name)}</div>
            <div class="friend-row__meta">${escapeHtml(un)} · ${formatDate(f.created_at)}</div>
          </div>
        </div>`;
    })
    .join("");
}

function renderTransactions(txs) {
  const box = document.getElementById("tx-list");
  if (!box) return;
  if (!txs.length) {
    box.innerHTML = `<p class="muted empty-state">Пока нет операций</p>`;
    return;
  }
  const typeLabel = {
    reward: "Награда",
    referral: "Реферал",
    withdraw: "Вывод",
  };
  box.innerHTML = txs
    .map((t) => {
      const amount = Number(t.amount) || 0;
      const plus = amount >= 0;
      const title =
        t.description || typeLabel[t.type] || t.type || "Операция";
      return `
        <div class="tx-row">
          <div>
            <div class="tx-row__title">${escapeHtml(title)}</div>
            <div class="tx-row__date">${formatDate(t.created_at)}</div>
          </div>
          <div class="tx-row__amount ${plus ? "tx-row__amount--plus" : "tx-row__amount--minus"}">
            ${plus ? "+" : ""}${formatMoney(amount)}
          </div>
        </div>`;
    })
    .join("");
}

function openTaskModal(task) {
  state.selectedTask = task;
  document.getElementById("modal-title").textContent = task.title;
  document.getElementById("modal-desc").textContent = task.description || "";
  document.getElementById("modal-reward").textContent = `+${formatMoney(task.reward)}`;
  document.getElementById("task-modal").hidden = false;
  try {
    tg?.HapticFeedback?.impactOccurred?.("light");
  } catch (_) {
    /* ignore */
  }
}

function closeTaskModal() {
  document.getElementById("task-modal").hidden = true;
  state.selectedTask = null;
}

async function loadReferrals() {
  const uid = state.user?.user_id || getTelegramUser().user_id;
  if (!uid) return;
  try {
    const data = await apiGet(`/api/user/${uid}/referrals`);
    state.referrals = data.referrals || [];
    document.getElementById("ref-count").textContent = String(data.count ?? 0);
    document.getElementById("ref-earned").textContent = formatMoney(
      (data.count || 0) * (data.bonus_per_invite || 10)
    );
    document.getElementById("ref-bonus").textContent = `+${formatMoney(
      data.bonus_per_invite || 10
    )}`;
    if (data.referral_link) {
      document.getElementById("ref-link").value = data.referral_link;
    }
    renderFriends(state.referrals);
  } catch (e) {
    console.warn("referrals", e);
  }
}

async function loadTransactions() {
  const uid = state.user?.user_id || getTelegramUser().user_id;
  if (!uid) return;
  try {
    const data = await apiGet(`/api/user/${uid}/transactions`);
    renderTransactions(data.transactions || []);
  } catch (e) {
    console.warn("transactions", e);
  }
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
  document.getElementById("btn-do-task")?.addEventListener("click", () => {
    showToast("«Выполнить» — скоро подключим");
  });
  document.getElementById("btn-check-task")?.addEventListener("click", () => {
    showToast("«Проверить» — скоро подключим");
  });
}

function bindWalletAndRefs() {
  document.getElementById("btn-withdraw")?.addEventListener("click", () => {
    showToast("Вывод средств — скоро");
  });
  document.getElementById("btn-refresh-wallet")?.addEventListener("click", async () => {
    await loadData();
    await loadTransactions();
    showToast("Обновлено");
  });

  document.getElementById("btn-copy-ref")?.addEventListener("click", async () => {
    const link = document.getElementById("ref-link")?.value;
    if (!link || link.startsWith("Ссылка")) {
      showToast("Ссылка пока недоступна");
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      showToast("Ссылка скопирована");
    } catch {
      const input = document.getElementById("ref-link");
      input?.select();
      showToast("Скопируйте ссылку вручную");
    }
  });

  document.getElementById("btn-share-ref")?.addEventListener("click", () => {
    const link = document.getElementById("ref-link")?.value;
    if (!link || link.startsWith("Ссылка")) {
      showToast("Ссылка пока недоступна");
      return;
    }
    const text = `Зарабатывай вместе со мной в ПлатиЛегко!\n${link}`;
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(
        `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent("Зарабатывай вместе со мной в ПлатиЛегко!")}`
      );
    } else {
      window.open(
        `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`,
        "_blank"
      );
    }
  });
}

async function loadData() {
  const tgUser = getTelegramUser();

  renderUser(
    {
      user_id: tgUser.user_id,
      username: tgUser.username,
      first_name: tgUser.first_name,
      balance: 0,
      tasks_completed: 0,
      referrals_count: 0,
      referral_bonus: 10,
    },
    tgUser
  );

  try {
    const tasksRes = await apiGet("/api/tasks");
    renderTasks(tasksRes.tasks || []);
  } catch (e) {
    console.warn("API tasks unavailable", e);
    renderTasks(DEMO_TASKS);
    showToast("Офлайн-режим: демо-задания");
  }

  if (tgUser.user_id) {
    try {
      const userRes = await apiGet(`/api/user/${tgUser.user_id}`);
      renderUser(
        {
          ...userRes,
          first_name: userRes.first_name || tgUser.first_name,
          username: userRes.username || tgUser.username,
        },
        tgUser
      );
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
  bindWalletAndRefs();
  loadData();
}

document.addEventListener("DOMContentLoaded", init);
