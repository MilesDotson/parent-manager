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
  supportRequests: [],
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

function formatDateTimeValue(value) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function sortByDueDate(items) {
  return [...items].sort((a, b) => `${a.date} ${a.time || ""}`.localeCompare(`${b.date} ${b.time || ""}`));
}

function sortByStart(items) {
  return [...items].sort((a, b) => (a.start || "").localeCompare(b.start || ""));
}

function reminderMessage(reminder) {
  const childText = reminder.child ? ` for ${reminder.child}` : "";
  const details = reminder.details ? `\n\nDetails: ${reminder.details}` : "";
  return `Hi${state.settings.coparentName ? ` ${state.settings.coparentName}` : ""}, quick reminder${childText}: ${reminder.title} is set for ${formatDateTime(reminder)}.${details}\n\nCan you please confirm when you have a chance?`;
}

function supportRequestMessage(request) {
  const childText = request.child ? ` for ${request.child}` : "";
  const endText = request.end ? ` until ${formatDateTimeValue(request.end)}` : "";
  const context = {
    other: "during your scheduled parenting time",
    mine: "during my scheduled parenting time",
    shared: "during a shared or unclear schedule window"
  }[request.parentingTime] || "during the schedule window";
  return `Hi${state.settings.coparentName ? ` ${state.settings.coparentName}` : ""}, I need to request childcare support${childText} ${context}.\n\nTime: ${formatDateTimeValue(request.start)}${endText}\nReason: ${request.reason}\nRequest: ${request.request}\n\nCan you please confirm whether you can help?`;
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
  renderSupportRequests();
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
  const openSupportRequests = state.supportRequests.filter((item) => ["requested", "no-response"].includes(item.status));
  const now = Date.now();
  const soon = openReminders.filter((item) => {
    const due = new Date(item.time ? `${item.date}T${item.time}` : `${item.date}T23:59`).getTime();
    return due >= now && due <= now + 48 * 60 * 60 * 1000;
  });
  $("#openReminderCount").textContent = openReminders.length;
  $("#dueSoonCount").textContent = soon.length;
  $("#openSupportCount").textContent = openSupportRequests.length;
  $("#agreementCount").textContent = state.agreements.length;

  const upcoming = sortByDueDate(openReminders).slice(0, 5);
  $("#upcomingList").innerHTML = upcoming.length
    ? upcoming.map(reminderItemTemplate).join("")
    : emptyState("No open reminders.");

  $("#recentMessages").innerHTML = state.messages.slice(0, 5).length
    ? state.messages.slice(0, 5).map(messageItemTemplate).join("")
    : emptyState("No messages logged yet.");

  $("#recentSupportRequests").innerHTML = state.supportRequests.slice(0, 5).length
    ? state.supportRequests.slice(0, 5).map(supportItemTemplate).join("")
    : emptyState("No childcare support requests logged.");
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

function supportStatusLabel(status) {
  return {
    requested: "Requested",
    accepted: "Accepted",
    declined: "Declined",
    "no-response": "No response",
    resolved: "Resolved"
  }[status] || "Requested";
}

function supportItemTemplate(item) {
  const statusClass = item.status === "accepted" || item.status === "resolved" ? "good" : item.status === "declined" || item.status === "no-response" ? "warn" : "";
  const endText = item.end ? ` to ${formatDateTimeValue(item.end)}` : "";
  return `
    <div class="item" data-support-id="${item.id}">
      <div class="item-header">
        <div>
          <p class="item-title">${escapeHtml(item.reason)}</p>
          <p class="item-meta">${formatDateTimeValue(item.start)}${endText}${item.child ? ` · ${escapeHtml(item.child)}` : ""}</p>
        </div>
        <span class="pill ${statusClass}">${supportStatusLabel(item.status)}</span>
      </div>
      <p>${escapeHtml(item.request)}</p>
      ${item.response ? `<p class="item-meta">Response: ${escapeHtml(item.response)}</p>` : ""}
      <div class="item-actions">
        <button class="secondary" type="button" data-action="send-support" data-id="${item.id}"><i data-lucide="send"></i><span>WhatsApp</span></button>
        <button class="ghost" type="button" data-action="support-accepted" data-id="${item.id}">Accepted</button>
        <button class="ghost" type="button" data-action="support-no-response" data-id="${item.id}">No response</button>
        <button class="ghost danger" type="button" data-action="delete-support" data-id="${item.id}">Delete</button>
      </div>
    </div>
  `;
}

function renderSupportRequests() {
  const filter = $("#supportFilter").value;
  const filtered = sortByStart(state.supportRequests).filter((item) => {
    if (filter === "open") return ["requested", "no-response"].includes(item.status);
    if (filter === "all") return true;
    return item.status === filter;
  });
  $("#supportList").innerHTML = filtered.length
    ? filtered.map(supportItemTemplate).join("")
    : emptyState("No support requests match this filter.");
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

  $("#supportForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    state.supportRequests.unshift({
      id: crypto.randomUUID(),
      reason: data.reason.trim(),
      child: data.child.trim(),
      parentingTime: data.parentingTime,
      start: data.start,
      end: data.end,
      request: data.request.trim(),
      response: data.response.trim(),
      status: data.status,
      requestedAt: data.requestedAt || new Date().toISOString().slice(0, 16),
      createdAt: new Date().toISOString()
    });
    saveState();
    event.currentTarget.reset();
    render();
    showToast("Support request saved");
  });

  $("#clearSupportForm").addEventListener("click", () => $("#supportForm").reset());
  $("#supportFilter").addEventListener("change", renderSupportRequests);

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
    if (action === "send-support") {
      const request = state.supportRequests.find((item) => item.id === id);
      window.open(whatsappUrl(supportRequestMessage(request)), "_blank", "noreferrer");
    }
    if (action === "support-accepted") {
      const request = state.supportRequests.find((item) => item.id === id);
      request.status = "accepted";
      saveState();
      render();
    }
    if (action === "support-no-response") {
      const request = state.supportRequests.find((item) => item.id === id);
      request.status = "no-response";
      saveState();
      render();
    }
    if (action === "delete-support") {
      state.supportRequests = state.supportRequests.filter((item) => item.id !== id);
      saveState();
      render();
      showToast("Support request deleted");
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
