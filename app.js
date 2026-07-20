/**
 * ПлатиЛегко Mini App
 * API_BASE — для Pages замените на ngrok HTTPS.
 */
const API_BASE = "http://127.0.0.1:8000";

const ICO_SUB = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 7h16v11a2 2 0 01-2 2H6a2 2 0 01-2-2V7z"/><path d="M8 7V5a4 4 0 018 0v2"/><circle cx="12" cy="13" r="1.2" fill="currentColor" stroke="none"/></svg>`;
const ICO_DONE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 13l4 4L19 7"/></svg>`;

const state = {
  user: null,
  tasks: [],
  selectedTask: null,
  verifying: false,
};

const tg = window.Telegram?.WebApp;

function money(v) {
  return `${Number(v || 0).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`;
}

function fmtDate(iso) {
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

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toast(msg, ms = 2600) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    el.hidden = true;
  }, ms);
}

function tgUser() {
  const u = tg?.initDataUnsafe?.user;
  if (u) {
    return {
      user_id: u.id,
      username: u.username || null,
      first_name: u.first_name || "Пользователь",
      photo_url: u.photo_url || null,
    };
  }
  return {
    user_id: 0,
    username: "preview",
    first_name: "Гость",
    photo_url: null,
  };
}

async function api(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: "application/json", ...(opts.body ? { "Content-Type": "application/json" } : {}) },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.detail || `HTTP ${res.status}`);
    err.data = data;
    throw err;
  }
  return data;
}

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((t) => {
    t.classList.toggle("tab--on", t.dataset.tab === name);
  });
  document.querySelectorAll(".dock__btn").forEach((b) => {
    b.classList.toggle("dock__btn--on", b.dataset.nav === name);
  });
  if (name === "wallet") loadTx();
  if (name === "friends") loadRefs();
}

function setAvatar(url, letter) {
  const img = document.getElementById("profile-avatar-img");
  const fb = document.getElementById("profile-avatar-fallback");
  fb.textContent = (letter || "?").toUpperCase();
  if (!url) {
    img.hidden = true;
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
  img.src = url;
}

function renderUser(user, tu) {
  state.user = user;
  const bal = money(user.balance);
  const name = user.first_name || tu?.first_name || "Гость";
  const un = user.username
    ? `@${user.username}`
    : tu?.username
      ? `@${tu.username}`
      : "@—";
  const refs = user.referrals_count ?? 0;
  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  };
  set("header-balance-value", bal);
  set("wallet-balance", bal);
  set("profile-name", name);
  set("profile-username", un);
  set("profile-id", `ID: ${user.user_id ?? "—"}`);
  set("stat-balance", bal);
  set("stat-tasks", String(user.tasks_completed ?? 0));
  set("stat-refs", String(refs));
  set("wallet-tasks", String(user.tasks_completed ?? 0));
  set("wallet-refs", String(refs));
  set("ref-count", String(refs));
  set("ref-earned", money(refs * (user.referral_bonus ?? 10)));
  if (user.referral_bonus != null) set("ref-bonus", `+${money(user.referral_bonus)}`);
  const link = document.getElementById("ref-link");
  if (link) link.value = user.referral_link || "Ссылка после /start";
  const photo = tu?.photo_url || (user.user_id ? `${API_BASE}/api/user/${user.user_id}/photo` : null);
  setAvatar(photo, name[0]);
}

function typeLabel(t) {
  if (t === "subscription" || !t) return "Подписка";
  return t;
}

function renderTasks(tasks) {
  state.tasks = tasks;
  const box = document.getElementById("tasks-list");
  if (!tasks.length) {
    box.innerHTML = `<p class="quiet center">Пока нет активных заданий</p>`;
    return;
  }
  box.innerHTML = tasks
    .map((t) => {
      const done = !!t.completed;
      return `
      <button type="button" class="task ${done ? "task--done" : ""}" data-id="${t.id}">
        <div class="task__ico">${done ? ICO_DONE : ICO_SUB}</div>
        <div>
          <div class="task__title">${esc(t.title)}</div>
          <div class="task__meta">${typeLabel(t.task_type)}${done ? " · выполнено" : ""}</div>
        </div>
        <div class="task__pay">+${money(t.reward)}</div>
      </button>`;
    })
    .join("");
  box.querySelectorAll(".task").forEach((el) => {
    el.addEventListener("click", () => {
      const id = Number(el.dataset.id);
      const task = state.tasks.find((x) => Number(x.id) === id);
      if (task) openModal(task);
    });
  });
}

function openModal(task) {
  state.selectedTask = task;
  document.getElementById("modal-type").textContent = typeLabel(task.task_type);
  document.getElementById("modal-reward").textContent = `+${money(task.reward)}`;
  document.getElementById("modal-title").textContent = task.title;
  document.getElementById("modal-desc").textContent =
    task.description ||
    "Подпишитесь на канал (или подайте заявку) и нажмите «Проверить».";
  document.getElementById("modal-status").textContent = task.completed
    ? "Уже выполнено"
    : "";
  const doBtn = document.getElementById("btn-do-task");
  const checkBtn = document.getElementById("btn-check-task");
  doBtn.disabled = !!task.completed;
  checkBtn.disabled = !!task.completed;
  document.getElementById("task-modal").hidden = false;
}

function closeModal() {
  document.getElementById("task-modal").hidden = true;
  state.selectedTask = null;
}

function openChannelLink(url) {
  if (!url) {
    toast("Ссылка на канал не задана");
    return;
  }
  let link = url.trim();
  if (!link.startsWith("http")) {
    if (link.startsWith("@")) link = `https://t.me/${link.slice(1)}`;
    else if (link.startsWith("t.me/")) link = `https://${link}`;
  }
  try {
    if (tg?.openTelegramLink && /t\.me\//i.test(link)) {
      tg.openTelegramLink(link);
      return;
    }
    if (tg?.openLink) {
      tg.openLink(link);
      return;
    }
  } catch (_) {
    /* fallthrough */
  }
  window.open(link, "_blank");
}

async function doTask() {
  const task = state.selectedTask;
  if (!task || task.completed) return;
  document.getElementById("modal-status").textContent =
    "Откройте канал, подайте заявку / подпишитесь, затем «Проверить».";
  openChannelLink(task.channel_link);
}

async function checkTask() {
  const task = state.selectedTask;
  if (!task || task.completed || state.verifying) return;
  const uid = state.user?.user_id || tgUser().user_id;
  if (!uid) {
    toast("Не удалось определить пользователя");
    return;
  }
  state.verifying = true;
  const status = document.getElementById("modal-status");
  status.textContent = "Проверяем подписку…";
  document.getElementById("btn-check-task").disabled = true;
  try {
    const res = await api(`/api/tasks/${task.id}/verify`, {
      method: "POST",
      body: JSON.stringify({ user_id: uid }),
    });
    status.textContent = res.message || "";
    toast(res.message || (res.ok ? "Готово" : "Не подтверждено"));
    if (res.ok && res.user) {
      renderUser(res.user, tgUser());
      task.completed = true;
      document.getElementById("btn-do-task").disabled = true;
      document.getElementById("btn-check-task").disabled = true;
      await loadTasks();
    } else {
      document.getElementById("btn-check-task").disabled = false;
    }
  } catch (e) {
    status.textContent = e.message || "Ошибка проверки";
    toast(e.message || "Ошибка");
    document.getElementById("btn-check-task").disabled = false;
  } finally {
    state.verifying = false;
  }
}

function renderFriends(list) {
  const box = document.getElementById("friends-list");
  if (!list.length) {
    box.innerHTML = `<p class="quiet center">Пока пусто</p>`;
    return;
  }
  box.innerHTML = list
    .map((f) => {
      const name = f.first_name || "Пользователь";
      const meta = f.username ? `@${f.username}` : `ID ${f.user_id}`;
      return `<div class="friend">
        <div class="avatar avatar--sm"><span class="avatar__fb">${esc(name[0] || "?")}</span></div>
        <div style="flex:1;min-width:0">
          <div class="friend__n">${esc(name)}</div>
          <div class="friend__m">${esc(meta)} · ${fmtDate(f.created_at)}</div>
        </div>
      </div>`;
    })
    .join("");
}

function renderTx(txs) {
  const box = document.getElementById("tx-list");
  if (!txs.length) {
    box.innerHTML = `<p class="quiet center">Нет операций</p>`;
    return;
  }
  const labels = { reward: "Награда", referral: "Реферал", withdraw: "Вывод" };
  box.innerHTML = txs
    .map((t) => {
      const a = Number(t.amount) || 0;
      const title = t.description || labels[t.type] || t.type;
      return `<div class="tx">
        <div>
          <div class="tx__t">${esc(title)}</div>
          <div class="tx__d">${fmtDate(t.created_at)}</div>
        </div>
        <div class="tx__a">${a >= 0 ? "+" : ""}${money(a)}</div>
      </div>`;
    })
    .join("");
}

async function loadTasks() {
  const uid = state.user?.user_id || tgUser().user_id;
  try {
    const q = uid ? `?user_id=${uid}` : "";
    const data = await api(`/api/tasks${q}`);
    renderTasks(data.tasks || []);
  } catch (e) {
    console.warn(e);
    renderTasks([]);
    toast("Нет связи с сервером");
  }
}

async function loadRefs() {
  const uid = state.user?.user_id || tgUser().user_id;
  if (!uid) return;
  try {
    const data = await api(`/api/user/${uid}/referrals`);
    document.getElementById("ref-count").textContent = String(data.count ?? 0);
    document.getElementById("ref-earned").textContent = money(
      (data.count || 0) * (data.bonus_per_invite || 10)
    );
    if (data.referral_link) document.getElementById("ref-link").value = data.referral_link;
    renderFriends(data.referrals || []);
  } catch (e) {
    console.warn(e);
  }
}

async function loadTx() {
  const uid = state.user?.user_id || tgUser().user_id;
  if (!uid) return;
  try {
    const data = await api(`/api/user/${uid}/transactions`);
    renderTx(data.transactions || []);
  } catch (e) {
    console.warn(e);
  }
}

async function loadData() {
  const tu = tgUser();
  renderUser(
    {
      user_id: tu.user_id,
      username: tu.username,
      first_name: tu.first_name,
      balance: 0,
      tasks_completed: 0,
      referrals_count: 0,
      referral_bonus: 10,
    },
    tu
  );
  if (tu.user_id) {
    try {
      const u = await api(`/api/user/${tu.user_id}`);
      renderUser(
        {
          ...u,
          first_name: u.first_name || tu.first_name,
          username: u.username || tu.username,
        },
        tu
      );
    } catch (e) {
      console.warn(e);
    }
  }
  await loadTasks();
}

function bind() {
  document.querySelectorAll(".dock__btn").forEach((b) => {
    b.addEventListener("click", () => switchTab(b.dataset.nav));
  });
  document.querySelectorAll("[data-close-modal]").forEach((el) => {
    el.addEventListener("click", closeModal);
  });
  document.getElementById("btn-do-task")?.addEventListener("click", doTask);
  document.getElementById("btn-check-task")?.addEventListener("click", checkTask);
  document.getElementById("btn-withdraw")?.addEventListener("click", () => {
    toast("Вывод — скоро");
  });
  document.getElementById("btn-refresh-wallet")?.addEventListener("click", async () => {
    await loadData();
    await loadTx();
    toast("Обновлено");
  });
  document.getElementById("btn-copy-ref")?.addEventListener("click", async () => {
    const v = document.getElementById("ref-link")?.value;
    if (!v || v.startsWith("Ссылка")) return toast("Ссылка недоступна");
    try {
      await navigator.clipboard.writeText(v);
      toast("Скопировано");
    } catch {
      toast("Скопируйте вручную");
    }
  });
  document.getElementById("btn-share-ref")?.addEventListener("click", () => {
    const v = document.getElementById("ref-link")?.value;
    if (!v || v.startsWith("Ссылка")) return toast("Ссылка недоступна");
    const url = `https://t.me/share/url?url=${encodeURIComponent(v)}&text=${encodeURIComponent("ПлатиЛегко — зарабатывай на заданиях")}`;
    if (tg?.openTelegramLink) tg.openTelegramLink(url);
    else window.open(url, "_blank");
  });
}

function init() {
  if (tg) {
    tg.ready();
    tg.expand();
    try {
      tg.setHeaderColor("#000000");
      tg.setBackgroundColor("#000000");
    } catch (_) {
      /* ignore */
    }
  }
  bind();
  loadData();
}

document.addEventListener("DOMContentLoaded", init);
