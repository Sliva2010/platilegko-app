const API_BASE = "http://127.0.0.1:8000";
const ADMIN_ID = 1377253285;
const tg = window.Telegram?.WebApp;

function toast(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    el.hidden = true;
  }, 2400);
}

function money(v) {
  return `${Number(v || 0).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`;
}

function uid() {
  return tg?.initDataUnsafe?.user?.id || 0;
}

function adminQuery() {
  return `admin_id=${uid() || ADMIN_ID}`;
}

async function api(path, opts = {}) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: {
        Accept: "application/json",
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
      },
      ...opts,
    });
  } catch (e) {
    throw new Error("Нет связи с сервером. Запустите backend.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.detail;
    const msg =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((d) => d.msg || JSON.stringify(d)).join(", ")
          : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

async function loadStats() {
  try {
    const s = await api(`/api/admin/stats?${adminQuery()}`);
    document.getElementById("s-users").textContent = String(s.users ?? 0);
    document.getElementById("s-tasks").textContent = String(s.active_tasks ?? 0);
    document.getElementById("s-done").textContent = String(s.completions ?? 0);
    document.getElementById("s-bal").textContent = money(s.total_balances);
    if (s.referral_bonus != null) {
      document.getElementById("f-ref-bonus").value = String(s.referral_bonus);
    }
  } catch (e) {
    document.getElementById("s-bal").textContent = "офлайн";
  }
  try {
    const st = await api(`/api/admin/settings?${adminQuery()}`);
    if (st.referral_bonus != null) {
      document.getElementById("f-ref-bonus").value = String(st.referral_bonus);
    }
    if (st.withdraw_hours != null) {
      document.getElementById("f-wd-hours").value = String(st.withdraw_hours);
    }
  } catch (_) {
    /* ignore */
  }
}

async function saveReferralBonus() {
  const input = document.getElementById("f-ref-bonus");
  const msg = document.getElementById("ref-msg");
  const amount = Number(input.value);
  if (Number.isNaN(amount) || amount < 0) {
    msg.textContent = "Укажите корректную сумму (≥ 0)";
    return;
  }
  try {
    const res = await api(`/api/admin/settings/referral_bonus?${adminQuery()}`, {
      method: "PUT",
      body: JSON.stringify({ amount }),
    });
    msg.textContent = `Сохранено: ${money(res.referral_bonus)} за приглашение`;
    toast("Реферальный бонус обновлён");
    input.value = String(res.referral_bonus);
  } catch (e) {
    msg.textContent = e.message;
    toast(e.message);
  }
}

async function saveWithdrawHours() {
  const input = document.getElementById("f-wd-hours");
  const msg = document.getElementById("wd-hours-msg");
  const hours = Number(input.value);
  if (!hours || hours < 1) {
    msg.textContent = "Укажите число часов (≥ 1)";
    return;
  }
  try {
    const res = await api(`/api/admin/settings/withdraw_hours?${adminQuery()}`, {
      method: "PUT",
      body: JSON.stringify({ hours: Math.floor(hours) }),
    });
    msg.textContent = `Сохранено: ${res.withdraw_hours} ч. для пользователей`;
    toast("Срок вывода обновлён");
    input.value = String(res.withdraw_hours);
  } catch (e) {
    msg.textContent = e.message;
    toast(e.message);
  }
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

async function loadWithdrawals() {
  const box = document.getElementById("wd-admin-list");
  if (!box) return;
  try {
    const data = await api(`/api/admin/withdrawals?${adminQuery()}`);
    const list = data.withdrawals || [];
    if (!list.length) {
      box.innerHTML = `<p class="hint">Заявок пока нет</p>`;
      return;
    }
    box.innerHTML = list
      .map((w) => {
        const name = w.first_name || w.username || w.user_id;
        return `<div class="item">
          <div class="item__top">
            <div class="item__title">#${w.id} · ${escapeHtml(String(name))}</div>
            <div class="item__pay">${money(w.amount)}</div>
          </div>
          <div class="item__meta">
            ${escapeHtml(w.method || "sbp").toUpperCase()} · ${escapeHtml(w.status || "pending")}<br/>
            ${escapeHtml(w.phone || "—")} · ${escapeHtml(w.bank || "—")}<br/>
            ${fmtDate(w.created_at)}
          </div>
        </div>`;
      })
      .join("");
  } catch (e) {
    box.innerHTML = `<p class="hint">${escapeHtml(e.message)}</p>`;
  }
}

function renderTasks(tasks) {
  const box = document.getElementById("tasks-admin");
  if (!tasks.length) {
    box.innerHTML = `<p class="hint">Заданий нет — создайте первое</p>`;
    return;
  }
  box.innerHTML = tasks
    .map((t) => {
      const on = !!t.is_active;
      return `
      <div class="item ${on ? "" : "item--off"}" data-id="${t.id}">
        <div class="item__top">
          <div class="item__title">${escapeHtml(t.title)}</div>
          <div class="item__pay">+${money(t.reward)}</div>
        </div>
        <div class="item__meta">
          ${t.task_type || "subscription"} · ${on ? "активно" : "выкл"}<br/>
          link: ${escapeHtml(t.channel_link || "—")}<br/>
          check: ${escapeHtml(t.channel_id || "—")}
        </div>
        <div class="item__actions">
          <button type="button" class="btn btn--ghost" data-act="toggle">${on ? "Выкл" : "Вкл"}</button>
          <button type="button" class="btn btn--danger" data-act="del">Удалить</button>
        </div>
      </div>`;
    })
    .join("");

  box.querySelectorAll(".item").forEach((item) => {
    const id = Number(item.dataset.id);
    item.querySelector('[data-act="toggle"]')?.addEventListener("click", async () => {
      try {
        await api(`/api/admin/tasks/${id}/toggle?${adminQuery()}`, { method: "POST" });
        toast("Обновлено");
        await loadTasks();
        await loadStats();
      } catch (e) {
        toast(e.message);
      }
    });
    item.querySelector('[data-act="del"]')?.addEventListener("click", async () => {
      if (!confirm("Удалить задание?")) return;
      try {
        await api(`/api/admin/tasks/${id}?${adminQuery()}`, { method: "DELETE" });
        toast("Удалено");
        await loadTasks();
        await loadStats();
      } catch (e) {
        toast(e.message);
      }
    });
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function loadTasks() {
  try {
    const data = await api(`/api/admin/tasks?${adminQuery()}`);
    renderTasks(data.tasks || []);
  } catch (e) {
    document.getElementById("tasks-admin").innerHTML =
      `<p class="hint">${escapeHtml(e.message)}</p>`;
  }
}

async function createTask() {
  const title = document.getElementById("f-title").value.trim();
  const description = document.getElementById("f-desc").value.trim();
  const reward = Number(document.getElementById("f-reward").value);
  const channel_link = document.getElementById("f-link").value.trim();
  const channel_id = document.getElementById("f-channel").value.trim();
  const task_type = document.getElementById("f-type").value;
  const msg = document.getElementById("form-msg");
  const btn = document.getElementById("btn-create");

  if (!title || !reward || !channel_link || !channel_id) {
    msg.textContent = "Заполните название, оплату, ссылку и ID канала";
    return;
  }

  btn.disabled = true;
  msg.textContent = "Создаём…";
  try {
    await api(`/api/admin/tasks?${adminQuery()}`, {
      method: "POST",
      body: JSON.stringify({
        title,
        description,
        reward,
        task_type,
        channel_link,
        channel_id,
      }),
    });
    msg.textContent = "Задание создано";
    toast("Задание создано");
    document.getElementById("f-title").value = "";
    document.getElementById("f-desc").value = "";
    document.getElementById("f-reward").value = "";
    document.getElementById("f-link").value = "";
    document.getElementById("f-channel").value = "";
    await loadTasks();
    await loadStats();
  } catch (e) {
    msg.textContent = e.message;
    toast(e.message);
  } finally {
    btn.disabled = false;
  }
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

  const id = uid();
  const badge = document.getElementById("access-badge");
  const denied = document.getElementById("denied");
  const panel = document.getElementById("panel");

  if (id && id !== ADMIN_ID) {
    badge.textContent = "Нет доступа";
    badge.classList.add("badge--no");
    denied.hidden = false;
    panel.hidden = true;
    return;
  }

  badge.textContent = "Admin";
  badge.classList.add("badge--ok");
  denied.hidden = true;
  panel.hidden = false;

  document.getElementById("btn-create")?.addEventListener("click", createTask);
  document.getElementById("btn-save-ref")?.addEventListener("click", saveReferralBonus);
  document.getElementById("btn-save-wd-hours")?.addEventListener("click", saveWithdrawHours);
  document.getElementById("btn-reload-wd")?.addEventListener("click", async () => {
    await loadWithdrawals();
    toast("Обновлено");
  });
  document.getElementById("btn-reload")?.addEventListener("click", async () => {
    await loadTasks();
    await loadStats();
    await loadWithdrawals();
    toast("Обновлено");
  });

  loadStats();
  loadTasks();
  loadWithdrawals();
}

document.addEventListener("DOMContentLoaded", init);
