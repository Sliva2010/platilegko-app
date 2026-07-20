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
  balanceNum: 0,
  withdrawHours: 48,
  withdrawing: false,
};

const tg = window.Telegram?.WebApp;

function money(v) {
  return `${Number(v || 0).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`;
}

function haptic(type = "light") {
  try {
    if (type === "success") tg?.HapticFeedback?.notificationOccurred?.("success");
    else if (type === "error") tg?.HapticFeedback?.notificationOccurred?.("error");
    else if (type === "select") tg?.HapticFeedback?.selectionChanged?.();
    else tg?.HapticFeedback?.impactOccurred?.(type);
  } catch (_) {
    /* ignore */
  }
}

function animateNumber(el, from, to, ms = 520) {
  if (!el) return;
  const start = performance.now();
  const d = to - from;
  function frame(now) {
    const t = Math.min(1, (now - start) / ms);
    const ease = 1 - Math.pow(1 - t, 3);
    el.textContent = money(from + d * ease);
    if (t < 1) requestAnimationFrame(frame);
    else el.textContent = money(to);
  }
  requestAnimationFrame(frame);
  el.classList.remove("balance-tick");
  void el.offsetWidth;
  el.classList.add("balance-tick");
}

function stagger(container) {
  if (!container) return;
  [...container.children].forEach((child, i) => {
    child.classList.add("anim-item");
    child.style.animationDelay = `${Math.min(i * 0.05, 0.45)}s`;
  });
}

function bindRipple(root = document) {
  root.querySelectorAll(".btn").forEach((btn) => {
    if (btn.dataset.rippleBound) return;
    btn.dataset.rippleBound = "1";
    btn.addEventListener("pointerdown", (e) => {
      const r = btn.getBoundingClientRect();
      btn.style.setProperty("--rx", `${((e.clientX - r.left) / r.width) * 100}%`);
      btn.style.setProperty("--ry", `${((e.clientY - r.top) / r.height) * 100}%`);
      btn.classList.remove("btn--ripple");
      void btn.offsetWidth;
      btn.classList.add("btn--ripple");
    });
  });
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

function formatApiError(data, status) {
  const detail = data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((d) => d.msg || JSON.stringify(d)).join(", ");
  }
  if (detail && typeof detail === "object") return JSON.stringify(detail);
  return `HTTP ${status}`;
}

function telegramInitData() {
  return (tg?.initData || "").trim();
}

async function api(path, opts = {}) {
  let res;
  const headers = {
    Accept: "application/json",
    ...(opts.body ? { "Content-Type": "application/json" } : {}),
    ...(opts.headers || {}),
  };
  const initData = telegramInitData();
  if (initData) {
    headers["X-Telegram-Init-Data"] = initData;
  }
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...opts,
      headers,
    });
  } catch (e) {
    throw new Error("Нет связи с сервером");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(formatApiError(data, res.status));
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
  haptic("select");
  if (name === "wallet") loadTx();
  if (name === "friends") loadRefs();
  if (name === "prizes") loadPrizes();
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
  const nextBal = Number(user.balance) || 0;
  const prevBal = state.balanceNum;
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

  const headerBal = document.getElementById("header-balance-value");
  const walletBal = document.getElementById("wallet-balance");
  const statBal = document.getElementById("stat-balance");
  if (prevBal !== nextBal) {
    animateNumber(headerBal, prevBal, nextBal);
    animateNumber(walletBal, prevBal, nextBal);
    animateNumber(statBal, prevBal, nextBal);
    const pill = document.querySelector(".pill");
    pill?.classList.add("pill--flash");
    setTimeout(() => pill?.classList.remove("pill--flash"), 600);
  } else {
    set("header-balance-value", money(nextBal));
    set("wallet-balance", money(nextBal));
    set("stat-balance", money(nextBal));
  }
  state.balanceNum = nextBal;

  set("profile-name", name);
  set("profile-username", un);
  set("profile-id", `ID: ${user.user_id ?? "—"}`);
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
    box.innerHTML = `<div class="blank anim-item"><div class="blank__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" width="24" height="24"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h5"/></svg></div><h2>Нет заданий</h2><p>Админ ещё не добавил активные задания</p></div>`;
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
  stagger(box);
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
  const modal = document.getElementById("task-modal");
  modal.classList.remove("is-closing");
  document.getElementById("modal-type").textContent = typeLabel(task.task_type);
  document.getElementById("modal-reward").textContent = `+${money(task.reward)}`;
  document.getElementById("modal-title").textContent = task.title;
  document.getElementById("modal-desc").textContent =
    task.description ||
    "Подпишитесь на канал (или подайте заявку) и нажмите «Проверить».";
  const status = document.getElementById("modal-status");
  status.textContent = task.completed ? "Уже выполнено" : "";
  status.classList.toggle("sheet__note--ok", !!task.completed);
  const doBtn = document.getElementById("btn-do-task");
  const checkBtn = document.getElementById("btn-check-task");
  doBtn.disabled = !!task.completed;
  checkBtn.disabled = !!task.completed;
  checkBtn.classList.remove("btn--loading");
  modal.hidden = false;
  haptic("light");
  bindRipple(modal);
}

function closeModal() {
  const modal = document.getElementById("task-modal");
  if (modal.hidden) return;
  modal.classList.add("is-closing");
  setTimeout(() => {
    modal.hidden = true;
    modal.classList.remove("is-closing");
    state.selectedTask = null;
  }, 200);
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
  const checkBtn = document.getElementById("btn-check-task");
  status.textContent = "Проверяем подписку…";
  status.classList.remove("sheet__note--ok");
  checkBtn.disabled = true;
  checkBtn.classList.add("btn--loading");
  try {
    const res = await api(`/api/tasks/${task.id}/verify`, {
      method: "POST",
      body: JSON.stringify({ user_id: uid }),
    });
    status.textContent = res.message || "";
    toast(res.message || (res.ok ? "Готово" : "Не подтверждено"));
    if (res.ok && res.user) {
      status.classList.add("sheet__note--ok");
      haptic("success");
      renderUser(res.user, tgUser());
      task.completed = true;
      document.getElementById("btn-do-task").disabled = true;
      checkBtn.disabled = true;
      await loadTasks();
    } else {
      haptic("error");
      checkBtn.disabled = false;
    }
  } catch (e) {
    status.textContent = e.message || "Ошибка проверки";
    toast(e.message || "Ошибка");
    haptic("error");
    checkBtn.disabled = false;
  } finally {
    checkBtn.classList.remove("btn--loading");
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
  stagger(box);
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
  stagger(box);
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

function setWithdrawHoursHint(hours) {
  state.withdrawHours = hours || 48;
  const el = document.getElementById("withdraw-hours-hint");
  if (el) {
    el.textContent = `Вывод средств будет в течение ${state.withdrawHours} часов.`;
  }
}

function openWithdraw() {
  const bal = state.balanceNum || 0;
  if (bal <= 0) {
    toast("Недостаточно средств");
    return;
  }
  const modal = document.getElementById("withdraw-modal");
  modal.classList.remove("is-closing");
  document.getElementById("wd-amount").value = String(bal);
  document.getElementById("wd-phone").value = "";
  document.getElementById("wd-bank").value = "";
  document.getElementById("wd-status").textContent = "";
  setWithdrawHoursHint(state.withdrawHours);
  modal.hidden = false;
  haptic("light");
  bindRipple(modal);
}

function closeWithdraw() {
  const modal = document.getElementById("withdraw-modal");
  if (!modal || modal.hidden) return;
  modal.classList.add("is-closing");
  setTimeout(() => {
    modal.hidden = true;
    modal.classList.remove("is-closing");
  }, 200);
}

async function submitWithdraw() {
  if (state.withdrawing) return;
  const uid = state.user?.user_id || tgUser().user_id;
  if (!uid) return toast("Не удалось определить пользователя");

  const amount = Number(document.getElementById("wd-amount").value);
  const phone = (document.getElementById("wd-phone").value || "").trim();
  const bank = (document.getElementById("wd-bank").value || "").trim();
  const status = document.getElementById("wd-status");
  const btn = document.getElementById("btn-wd-submit");

  if (!amount || amount <= 0) {
    status.textContent = "Укажите сумму";
    return;
  }
  if (amount > state.balanceNum + 0.001) {
    status.textContent = "Сумма больше баланса";
    return;
  }
  if (phone.replace(/\D/g, "").length < 10) {
    status.textContent = "Укажите корректный номер телефона";
    return;
  }
  if (!bank) {
    status.textContent = "Укажите банк";
    return;
  }

  state.withdrawing = true;
  btn.disabled = true;
  btn.classList.add("btn--loading");
  status.textContent = "Отправляем заявку…";
  try {
    const res = await api(`/api/user/${uid}/withdraw`, {
      method: "POST",
      body: JSON.stringify({
        amount,
        phone,
        bank,
        method: "sbp",
      }),
    });
    if (res.withdraw_hours) setWithdrawHoursHint(res.withdraw_hours);
    status.textContent = res.message || "Заявка принята";
    status.classList.add("sheet__note--ok");
    toast(res.message || "Заявка принята");
    haptic("success");
    if (res.user) renderUser(res.user, tgUser());
    await loadTx();
    setTimeout(() => closeWithdraw(), 1400);
  } catch (e) {
    status.textContent = e.message || "Ошибка";
    status.classList.remove("sheet__note--ok");
    toast(e.message || "Ошибка");
    haptic("error");
  } finally {
    btn.disabled = false;
    btn.classList.remove("btn--loading");
    state.withdrawing = false;
  }
}

function applyMaintenance(on, message) {
  const box = document.getElementById("maintenance");
  const text = document.getElementById("maintenance-text");
  if (!box) return;
  if (on) {
    if (text && message) text.textContent = message;
    box.hidden = false;
    document.body.style.overflow = "hidden";
  } else {
    box.hidden = true;
    document.body.style.overflow = "";
  }
}

function buildPrizeTrack(need = 20) {
  const track = document.getElementById("prize-track");
  if (!track) return;
  if (track.childElementCount === need) return;
  track.innerHTML = "";
  for (let i = 1; i <= need; i++) {
    const cell = document.createElement("div");
    cell.className = "prize-cell";
    cell.dataset.n = String(i);
    cell.textContent = String(i);
    track.appendChild(cell);
  }
}

function paintPrizeTrack(progress, need, claimed) {
  const track = document.getElementById("prize-track");
  if (!track) return;
  const cells = track.querySelectorAll(".prize-cell");
  cells.forEach((cell) => {
    const n = Number(cell.dataset.n);
    cell.classList.remove("prize-cell--on", "prize-cell--next", "prize-cell--done");
    if (n <= progress) {
      cell.classList.add("prize-cell--on");
      if (claimed || progress >= need) cell.classList.add("prize-cell--done");
    } else if (n === progress + 1 && !claimed && progress < need) {
      cell.classList.add("prize-cell--next");
    }
  });
}

function renderPrize(p) {
  if (!p) return;
  const need = p.need || 20;
  const progress = Math.min(p.progress ?? 0, need);
  const percent = p.percent ?? Math.round((100 * progress) / need);
  const reward = p.reward ?? 1500;

  buildPrizeTrack(need);
  paintPrizeTrack(progress, need, !!p.claimed);

  setText("prize-title", p.title || "Пригласи 20 друзей");
  setText(
    "prize-desc",
    p.description ||
      "Каждый друг по твоей ссылке зажигает ячейку. Когда все 20 заполнены — забери 1500 ₽ на баланс."
  );
  setText("prize-reward", money(reward).replace(" ₽", "") + " ₽");
  setText("prize-need", String(need));

  const numEl = document.getElementById("prize-progress-text");
  if (numEl) {
    const prev = Number(numEl.textContent) || 0;
    numEl.textContent = String(progress);
    if (prev !== progress) {
      numEl.classList.remove("is-bump");
      void numEl.offsetWidth;
      numEl.classList.add("is-bump");
    }
  }
  setText("prize-percent", `${percent}%`);
  const fill = document.getElementById("prize-fill");
  if (fill) fill.style.width = `${Math.min(100, percent)}%`;

  const panel = document.getElementById("prize-panel");
  panel?.classList.toggle("prize-panel--complete", progress >= need && !p.claimed);
  panel?.classList.toggle("prize-panel--claimed", !!p.claimed);

  const btn = document.getElementById("btn-claim-prize");
  const status = document.getElementById("prize-status");
  if (!btn) return;
  btn.dataset.prizeId = p.id || "invite_20";

  if (p.claimed) {
    btn.disabled = true;
    btn.textContent = "Приз уже на балансе";
    if (status) status.textContent = "1 500 ₽ зачислены. Спасибо за приглашения!";
  } else if (p.can_claim || progress >= need) {
    btn.disabled = false;
    btn.textContent = `Получить приз · ${money(reward)}`;
    if (status) status.textContent = "Шкала заполнена — забери 1500 ₽ на баланс";
  } else {
    btn.disabled = true;
    btn.textContent = `Получить приз · ${money(reward)}`;
    const left = Math.max(0, need - progress);
    if (status) {
      status.textContent =
        progress === 0
          ? "Приглашай друзей — ячейки 1–20 загорятся сами"
          : `Заполнено ${progress} из ${need}. Осталось: ${left}`;
    }
  }
}

function setText(id, v) {
  const el = document.getElementById(id);
  if (el) el.textContent = v;
}

async function loadPrizes() {
  const uid = state.user?.user_id || tgUser().user_id;
  if (!uid) return;
  try {
    const data = await api(`/api/user/${uid}/prizes`);
    const p = (data.prizes || [])[0];
    renderPrize(p);
  } catch (e) {
    console.warn(e);
  }
}

async function claimPrize() {
  const uid = state.user?.user_id || tgUser().user_id;
  const btn = document.getElementById("btn-claim-prize");
  if (!uid || !btn || btn.disabled) return;
  const prizeId = btn.dataset.prizeId || "invite_20";
  btn.disabled = true;
  btn.classList.add("btn--loading");
  try {
    const res = await api(`/api/user/${uid}/prizes/claim`, {
      method: "POST",
      body: JSON.stringify({ prize_id: prizeId }),
    });
    toast(res.message || "Приз начислен");
    haptic("success");
    if (res.user) renderUser(res.user, tgUser());
    const p = (res.prizes || [])[0];
    if (p) renderPrize(p);
    else await loadPrizes();
  } catch (e) {
    toast(e.message || "Ошибка");
    haptic("error");
    btn.disabled = false;
  } finally {
    btn.classList.remove("btn--loading");
  }
}

async function loadPublicSettings() {
  try {
    const s = await api("/api/settings/public");
    if (s.withdraw_hours) setWithdrawHoursHint(s.withdraw_hours);
    applyMaintenance(!!s.maintenance_mode, s.maintenance_message);
  } catch (e) {
    console.warn(e);
  }
}

function bind() {
  document.querySelectorAll(".dock__btn").forEach((b) => {
    b.addEventListener("click", () => switchTab(b.dataset.nav));
  });
  document.querySelectorAll("[data-close-modal]").forEach((el) => {
    el.addEventListener("click", closeModal);
  });
  document.querySelectorAll("[data-close-withdraw]").forEach((el) => {
    el.addEventListener("click", closeWithdraw);
  });
  document.getElementById("btn-do-task")?.addEventListener("click", doTask);
  document.getElementById("btn-check-task")?.addEventListener("click", checkTask);
  document.getElementById("btn-withdraw")?.addEventListener("click", openWithdraw);
  document.getElementById("btn-wd-submit")?.addEventListener("click", submitWithdraw);
  document.getElementById("btn-claim-prize")?.addEventListener("click", claimPrize);
  document.getElementById("btn-prize-to-friends")?.addEventListener("click", () => {
    switchTab("friends");
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
  bindRipple();
  loadPublicSettings();
  loadData().then(() => loadPrizes());
}

document.addEventListener("DOMContentLoaded", init);
