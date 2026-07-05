const STORAGE_KEY = "parent-manager-state-v1";

const defaultState = {
  settings: {
    coparentName: "",
    coparentEmail: "",
    whatsappPhone: "",
    communityName: ""
  },
  reminders: [
    {
      id: crypto.randomUUID(),
      title: "Confirm weekend pickup window",
      child: "",
      category: "Exchange",
      date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      time: "17:00",
      details: "Confirm pickup location and exact time before Friday evening.",
      done: false,
      createdAt: new Date().toISOString()
    }
  ],
  agreements: [
    {
      id: crypto.randomUUID(),
      title: "Decision log",
      body: "Important schedule, school, medical, and expense decisions should be confirmed in writing.",
      createdAt: new Date().toISOString()
    }
  ],
  messages: []
};

let state = loadState();
let toastTimer;

function loadState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return structuredClone(defaultState);
    const parsed = JSON.parse(stored);
    return {
      ...structuredClone(defaultState),
      ...parsed,
      settings: {
        ...defaultState.settings,
        ...parsed.settings,
        coparentName: parsed.settings?.coparentName || "",
        coparentEmail: parsed.settings?.coparentEmail || ""
      }
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function $(selector) {
  return document.querySelector(selector);
}

function $all(selector) {
  return [...document.querySelectorAll(selector)];
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
}

function formatDateTime(item) {
  const date = item.time ? `${item.date}T${item.time}` : `${item.date}T12:00`;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: item.time ? "short" : undefined
  }).format(new Date(date));
}

function sortByDueDate(items) {
  return [...items].sort((a, b) => `${a.date} ${a.time || ""}`.localeCompare(`${b.date} ${b.time || ""}`));
}

function reminderMessage(reminder) {
  const childText = reminder.child ? ` for ${reminder.child}` : "";
  const details = reminder.details ? `\n\nDetails: ${reminder.details}` : "";
  return `Hi${state.settings.coparentName ? ` ${state.settings.coparentName}` : ""}, quick reminder${childText}: ${reminder.title} is set for ${formatDateTime(reminder)}.${details}\n\nCan you please confirm when you have a chance?`;
}

function whatsappUrl(text) {
  const encoded = encodeURIComponent(text);
  const phone = state.settings.whatsappPhone.replace(/[^\d]/g, "");
  return phone ? `https://wa.me/${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}

function chargedWordCount(text) {
  const matches = text.toLowerCase().match(/\b(always|never|fault|liar|refuse|irresponsible|late again|you did|you failed|ridiculous|unacceptable)\b/g);
  return matches ? matches.length : 0;
}

function generateDraft({ topic, facts, goal, tone }) {
  const opener = tone === "warm"
    ? "Hi, I want to keep this simple and focused on the kids."
    : "Hi, I want to confirm this in writing.";
  const firmClose = "Please reply with what works or what specific alternative you are proposing.";
  const warmClose = "Thanks for helping keep this organized.";
  const briefClose = "Please confirm when you can.";
  const close = tone === "firm" ? firmClose : tone === "warm" ? warmClose : briefClose;
  const cleanFacts = facts
    .replace(/\byou always\b/gi, "this has happened more than once")
    .replace(/\byou never\b/gi, "I do not have confirmation that")
    .replace(/\byour fault\b/gi, "something we need to resolve")
    .trim();

  const goalLine = {
    confirm: "Can we confirm the plan below so there is no confusion?",
    request: "I am asking that we agree on the next step below.",
    document: "I am documenting the facts so we both have the same record.",
    deescalate: "I do not want to argue; I want us to land on a workable next step."
  }[goal];

  return `${opener}\n\nTopic: ${topic}\n\n${goalLine}\n\n${cleanFacts}\n\n${close}`;
}

function render() {
  renderDashboard();
  renderReminders();
  renderMessages();
  renderAgreements();
  renderSettings();
  if (window.lucide) window.lucide.createIcons();
}

function emptyState(text) {
  return `<div class="item"><p class="muted">${text}</p></div>`;
}

function renderDashboard() {
  const openReminders = state.reminders.filter((item) => !item.done);
  const now = Date.now();
  const soon = openReminders.filter((item) => {
    const due = new Date(item.time ? `${item.date}T${item.time}` : `${item.date}T23:59`).getTime();
    return due >= now && due <= now + 48 * 60 * 60 * 1000;
  });
  $("#openReminderCount").textContent = openReminders.length;
  $("#dueSoonCount").textContent = soon.length;
  $("#agreementCount").textContent = state.agreements.length;
  $("#messageCount").textContent = state.messages.length;

  const upcoming = sortByDueDate(openReminders).slice(0, 5);
  $("#upcomingList").innerHTML = upcoming.length
    ? upcoming.map(reminderItemTemplate).join("")
    : emptyState("No open reminders.");

  $("#recentMessages").innerHTML = state.messages.slice(0, 5).length
    ? state.messages.slice(0, 5).map(messageItemTemplate).join("")
    : emptyState("No messages logged yet.");
}

function reminderItemTemplate(item) {
  const pillClass = item.done ? "done" : "good";
  return `
    <div class="item" data-reminder-id="${item.id}">
      <div class="item-header">
        <div>
          <p class="item-title">${escapeHtml(item.title)}</p>
          <p class="item-meta">${escapeHtml(item.category)}${item.child ? ` · ${escapeHtml(item.child)}` : ""} · ${formatDateTime(item)}</p>
        </div>
        <span class="pill ${pillClass}">${item.done ? "Done" : "Open"}</span>
      </div>
      ${item.details ? `<p>${escapeHtml(item.details)}</p>` : ""}
      <div class="item-actions">
        <button class="secondary" type="button" data-action="send-reminder" data-id="${item.id}"><i data-lucide="send"></i><span>WhatsApp</span></button>
        <button class="ghost" type="button" data-action="toggle-reminder" data-id="${item.id}">${item.done ? "Reopen" : "Done"}</button>
        <button class="ghost danger" type="button" data-action="delete-reminder" data-id="${item.id}">Delete</button>
      </div>
    </div>
  `;
}

function renderReminders() {
  const filter = $("#reminderFilter").value;
  const filtered = sortByDueDate(state.reminders).filter((item) => {
    if (filter === "open") return !item.done;
    if (filter === "done") return item.done;
    return true;
  });
  $("#reminderList").innerHTML = filtered.length
    ? filtered.map(reminderItemTemplate).join("")
    : emptyState("No reminders match this filter.");
}

function messageItemTemplate(item) {
  return `
    <div class="item">
      <div class="item-header">
        <p class="item-title">${escapeHtml(item.topic)}</p>
        <span class="item-meta">${new Date(item.createdAt).toLocaleString()}</span>
      </div>
      <p>${escapeHtml(item.text)}</p>
    </div>
  `;
}

function renderMessages() {
  $("#messageLog").innerHTML = state.messages.length
    ? state.messages.map(messageItemTemplate).join("")
    : emptyState("Drafts you log will appear here.");
}

function renderAgreements() {
  $("#agreementList").innerHTML = state.agreements.length
    ? state.agreements.map((item) => `
      <div class="item" data-agreement-id="${item.id}">
        <div class="item-header">
          <p class="item-title">${escapeHtml(item.title)}</p>
          <button class="ghost danger" type="button" data-action="delete-agreement" data-id="${item.id}">Delete</button>
        </div>
        <p>${escapeHtml(item.body)}</p>
        <p class="item-meta">Added ${new Date(item.createdAt).toLocaleDateString()}</p>
      </div>
    `).join("")
    : emptyState("No agreements saved.");
}

function renderSettings() {
  const form = $("#settingsForm");
  form.coparentName.value = state.settings.coparentName || "";
  form.coparentEmail.value = state.settings.coparentEmail || "";
  form.whatsappPhone.value = state.settings.whatsappPhone || "";
  form.communityName.value = state.settings.communityName || "";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function switchView(viewId) {
  $all(".view").forEach((view) => view.classList.toggle("is-active", view.id === viewId));
  $all(".nav-item").forEach((item) => item.classList.toggle("is-active", item.dataset.view === viewId));
}

function bindEvents() {
  $all(".nav-item").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });
  $all("[data-jump]").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.jump));
  });

  $("#reminderForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    state.reminders.push({
      id: crypto.randomUUID(),
      title: data.title.trim(),
      child: data.child.trim(),
      category: data.category,
      date: data.date,
      time: data.time,
      details: data.details.trim(),
      done: false,
      createdAt: new Date().toISOString()
    });
    saveState();
    event.currentTarget.reset();
    render();
    showToast("Reminder saved");
  });

  $("#clearReminderForm").addEventListener("click", () => $("#reminderForm").reset());
  $("#reminderFilter").addEventListener("change", renderReminders);

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const { action, id } = button.dataset;
    if (action === "toggle-reminder") {
      const reminder = state.reminders.find((item) => item.id === id);
      reminder.done = !reminder.done;
      saveState();
      render();
    }
    if (action === "delete-reminder") {
      state.reminders = state.reminders.filter((item) => item.id !== id);
      saveState();
      render();
      showToast("Reminder deleted");
    }
    if (action === "send-reminder") {
      const reminder = state.reminders.find((item) => item.id === id);
      window.open(whatsappUrl(reminderMessage(reminder)), "_blank", "noreferrer");
    }
    if (action === "delete-agreement") {
      state.agreements = state.agreements.filter((item) => item.id !== id);
      saveState();
      render();
      showToast("Agreement deleted");
    }
  });

  $("#messageForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const draft = generateDraft(data);
    $("#draftText").value = draft;
    updateDraftActions(draft);
  });

  $("#draftText").addEventListener("input", (event) => updateDraftActions(event.target.value));

  $("#copyDraft").addEventListener("click", async () => {
    const text = $("#draftText").value.trim();
    if (!text) return showToast("No draft to copy");
    await navigator.clipboard.writeText(text);
    showToast("Draft copied");
  });

  $("#logDraft").addEventListener("click", () => {
    const text = $("#draftText").value.trim();
    const topic = $("#messageForm").topic.value.trim() || "Message";
    if (!text) return showToast("No draft to log");
    state.messages.unshift({ id: crypto.randomUUID(), topic, text, createdAt: new Date().toISOString() });
    saveState();
    render();
    showToast("Message logged");
  });

  $("#clearMessageLog").addEventListener("click", () => {
    state.messages = [];
    saveState();
    render();
    showToast("Message log cleared");
  });

  $("#agreementForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    state.agreements.unshift({
      id: crypto.randomUUID(),
      title: data.title.trim(),
      body: data.body.trim(),
      createdAt: new Date().toISOString()
    });
    saveState();
    event.currentTarget.reset();
    render();
    showToast("Agreement saved");
  });

  $("#printAgreements").addEventListener("click", () => window.print());

  $("#settingsForm").addEventListener("submit", (event) => {
    event.preventDefault();
    state.settings = Object.fromEntries(new FormData(event.currentTarget));
    saveState();
    updateDraftActions($("#draftText").value);
    showToast("Settings saved");
  });

  $("#exportData").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `parent-manager-export-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  });

  $("#importData").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      state = { ...defaultState, ...imported };
      saveState();
      render();
      showToast("Data imported");
    } catch {
      showToast("Import failed");
    } finally {
      event.target.value = "";
    }
  });

  $("#requestNotifications").addEventListener("click", async () => {
    if (!("Notification" in window)) return showToast("Notifications are not supported here");
    const permission = await Notification.requestPermission();
    showToast(permission === "granted" ? "Browser alerts enabled" : "Browser alerts not enabled");
  });
}

function updateDraftActions(text) {
  const trimmed = text.trim();
  $("#sendWhatsApp").href = trimmed ? whatsappUrl(trimmed) : "#";
  const count = chargedWordCount(trimmed);
  const score = $("#toneScore");
  score.textContent = !trimmed ? "No draft" : count ? `${count} tone flag${count === 1 ? "" : "s"}` : "Neutral";
  score.className = `pill ${trimmed && !count ? "good" : count ? "warn" : ""}`;
}

function checkDueReminders() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const now = new Date();
  state.reminders
    .filter((item) => !item.done && !item.notifiedAt && item.time)
    .forEach((item) => {
      const due = new Date(`${item.date}T${item.time}`);
      const delta = due.getTime() - now.getTime();
      if (delta > 0 && delta <= 15 * 60 * 1000) {
        new Notification("Parent Manager reminder", { body: `${item.title} at ${formatDateTime(item)}` });
        item.notifiedAt = new Date().toISOString();
        saveState();
      }
    });
}

bindEvents();
render();
updateDraftActions("");
setInterval(checkDueReminders, 60 * 1000);
