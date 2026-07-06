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
  schoolOptions: [],
  homeworkItems: [],
  chatMessages: [],
  followUps: [],
  selectedPlanDate: new Date().toISOString().slice(0, 10),
  dailyPlans: {},
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

function sortByDateField(items, field) {
  return [...items].sort((a, b) => (a[field] || "").localeCompare(b[field] || ""));
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

function schoolDecisionMessage(option) {
  const deadline = option.deadline ? `\nDeadline: ${formatDateTimeValue(`${option.deadline}T12:00`)}` : "";
  const childText = option.child ? ` for ${option.child}` : "";
  return `Hi${state.settings.coparentName ? ` ${state.settings.coparentName}` : ""}, I want us to align on the school option${childText}.\n\nSchool: ${option.name}\nStage: ${schoolStageLabel(option.stage)}\nPriority: ${option.priority}${deadline}\nNotes: ${option.notes || "No notes added yet."}\n\nCan you review and share your thoughts or concerns?`;
}

function homeworkMessage(item) {
  const childText = item.child ? ` for ${item.child}` : "";
  const subjectText = item.subject ? ` (${item.subject})` : "";
  return `Hi${state.settings.coparentName ? ` ${state.settings.coparentName}` : ""}, quick homework check${childText}.\n\nAssignment: ${item.title}${subjectText}\nDue: ${formatDateTimeValue(`${item.dueDate}T12:00`)}\nStatus: ${homeworkStatusLabel(item.status)}\nNotes: ${item.notes || "No notes added yet."}\n\nCan you confirm what has been completed on your side?`;
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
  renderAgentDesk();
  renderPlanner();
  renderDashboard();
  renderReminders();
  renderSupportRequests();
  renderSchoolOptions();
  renderHomeworkItems();
  renderChatImports();
  renderMessages();
  renderAgreements();
  renderSettings();
  if (window.lucide) window.lucide.createIcons();
}

function emptyState(text) {
  return `<div class="item"><p class="muted">${text}</p></div>`;
}

function agentQueueItems() {
  const now = Date.now();
  const reminderItems = state.reminders
    .filter((item) => !item.done)
    .map((item) => {
      const due = new Date(item.time ? `${item.date}T${item.time}` : `${item.date}T23:59`).getTime();
      return {
        id: item.id,
        type: "reminder",
        title: item.title,
        detail: `${item.category} · due ${formatDateTime(item)}`,
        priority: due <= now + 48 * 60 * 60 * 1000 ? "high" : "medium",
        sourceView: "reminders",
        plannerTitle: item.title,
        facts: reminderMessage(item)
      };
    });
  const supportItems = state.supportRequests
    .filter((item) => ["requested", "no-response"].includes(item.status))
    .map((item) => ({
      id: item.id,
      type: "support",
      title: item.reason,
      detail: `${supportStatusLabel(item.status)} · ${formatDateTimeValue(item.start)}`,
      priority: item.status === "no-response" ? "high" : "medium",
      sourceView: "support",
      plannerTitle: `Resolve childcare support: ${item.reason}`,
      facts: supportRequestMessage(item)
    }));
  const homeworkItems = state.homeworkItems
    .filter((item) => item.status !== "submitted")
    .map((item) => ({
      id: item.id,
      type: "homework",
      title: item.title,
      detail: `${homeworkStatusLabel(item.status)} · due ${formatDateTimeValue(`${item.dueDate}T12:00`)}`,
      priority: item.status === "needs-help" ? "high" : "medium",
      sourceView: "school",
      plannerTitle: `Homework follow-up: ${item.title}`,
      facts: homeworkMessage(item)
    }));
  const schoolItems = state.schoolOptions
    .filter((item) => item.stage === "decision-needed")
    .map((item) => ({
      id: item.id,
      type: "school",
      title: item.name,
      detail: `Decision needed${item.deadline ? ` · deadline ${formatDateTimeValue(`${item.deadline}T12:00`)}` : ""}`,
      priority: "high",
      sourceView: "school",
      plannerTitle: `School decision: ${item.name}`,
      facts: schoolDecisionMessage(item)
    }));
  const followUpItems = state.followUps
    .filter((item) => !["responded", "closed"].includes(item.status))
    .map((item) => {
      const due = item.nextFollowUpAt ? new Date(item.nextFollowUpAt).getTime() : 0;
      const isDue = due && due <= Date.now();
      return {
        id: item.id,
        type: "follow-up",
        title: item.title,
        detail: `${followUpStatusLabel(item.status)}${item.nextFollowUpAt ? ` · next ${formatDateTimeValue(item.nextFollowUpAt)}` : ""}`,
        priority: isDue || item.status === "follow-up-due" ? "high" : "medium",
        sourceView: "whatsapp",
        plannerTitle: `Follow up: ${item.title}`,
        facts: followUpMessage(item)
      };
    });
  const chatItems = state.chatMessages
    .filter((item) => /(school|homework|pickup|doctor|therapy|expense|reimburse|schedule|calendar|support)/i.test(item.text))
    .slice(0, 5)
    .map((item) => ({
      id: item.id,
      type: "chat",
      title: `${chatCategoryLabel(item.category)} message from ${item.sender}`,
      detail: new Date(item.timestamp).toLocaleString(),
      priority: "low",
      sourceView: "whatsapp",
      plannerTitle: `Review WhatsApp: ${chatCategoryLabel(item.category)}`,
      facts: `${item.sender} wrote on ${new Date(item.timestamp).toLocaleString()}:\n${item.text}`
    }));
  const priorityWeight = { high: 0, medium: 1, low: 2 };
  return [...followUpItems, ...supportItems, ...homeworkItems, ...schoolItems, ...reminderItems, ...chatItems]
    .sort((a, b) => priorityWeight[a.priority] - priorityWeight[b.priority])
    .slice(0, 12);
}

function itemHasDate(item) {
  return /\b(due|deadline|at|on)\b/i.test(item.detail || "") || /\d{1,2}\/\d{1,2}|\d{4}-\d{2}-\d{2}|AM|PM/i.test(`${item.detail} ${item.facts}`);
}

function itemHasEvidence(item) {
  return /(whatsapp|message|school|portal|email|calendar|receipt|doctor|therapy|homework|form|source|wrote)/i.test(`${item.detail} ${item.facts}`);
}

function itemHasNextAction(item) {
  return /(confirm|reply|review|resolve|request|check|send|support|decision|follow-up|follow up)/i.test(`${item.title} ${item.plannerTitle} ${item.facts}`);
}

function meticulousCheckRows(queue) {
  const total = Math.max(queue.length, 1);
  const dated = queue.filter(itemHasDate).length;
  const evidenced = queue.filter(itemHasEvidence).length;
  const actionable = queue.filter(itemHasNextAction).length;
  const planned = Object.values(state.dailyPlans || {}).flatMap((plan) => plan.tasks || []).filter((task) => !task.done).length;
  return [
    {
      title: "Dates are attached",
      detail: `${dated}/${queue.length} active items include a date, time, or deadline.`,
      pass: queue.length === 0 || dated / total >= 0.75
    },
    {
      title: "Evidence is named",
      detail: `${evidenced}/${queue.length} active items refer to a source such as WhatsApp, school, calendar, receipt, or form.`,
      pass: queue.length === 0 || evidenced / total >= 0.75
    },
    {
      title: "Next action is clear",
      detail: `${actionable}/${queue.length} active items contain a concrete next action.`,
      pass: queue.length === 0 || actionable / total >= 0.75
    },
    {
      title: "Work is planned",
      detail: `${planned} open task${planned === 1 ? "" : "s"} currently exist in daily plans.`,
      pass: planned > 0 || queue.length === 0
    }
  ];
}

function checklistTemplate(rows) {
  return rows.map((row) => `
    <div class="check-row ${row.pass ? "pass" : ""}">
      <span class="check-mark">${row.pass ? "✓" : "!"}</span>
      <div>
        <strong>${escapeHtml(row.title)}</strong>
        <span>${escapeHtml(row.detail)}</span>
      </div>
    </div>
  `).join("");
}

function agentItemTemplate(item) {
  return `
    <div class="item agent-item ${item.priority}" data-agent-id="${item.id}" data-agent-type="${item.type}">
      <div class="item-header">
        <div>
          <p class="item-title">${escapeHtml(item.title)}</p>
          <p class="item-meta">${escapeHtml(item.detail)}</p>
        </div>
        <span class="pill ${item.priority === "high" ? "warn" : item.priority === "low" ? "good" : ""}">${item.priority}</span>
      </div>
      <div class="item-actions">
        <button class="primary" type="button" data-action="agent-plan-item" data-agent-type="${item.type}" data-id="${item.id}"><i data-lucide="calendar-plus"></i><span>Plan</span></button>
        <button class="secondary" type="button" data-action="agent-draft-item" data-agent-type="${item.type}" data-id="${item.id}"><i data-lucide="wand-2"></i><span>Draft</span></button>
        ${item.type === "follow-up" ? `<button class="ghost" type="button" data-action="follow-up-responded" data-id="${item.id}">Responded</button><button class="ghost" type="button" data-action="follow-up-again" data-id="${item.id}">Ask again</button>` : ""}
        <button class="ghost" type="button" data-action="agent-open-item" data-view="${item.sourceView}">Open</button>
      </div>
    </div>
  `;
}

function followUpStatusLabel(status) {
  return {
    waiting: "Waiting for response",
    "follow-up-due": "Follow-up due",
    responded: "Responded",
    closed: "Closed"
  }[status] || "Waiting for response";
}

function followUpMessage(item) {
  return `Hi${state.settings.coparentName ? ` ${state.settings.coparentName}` : ""}, following up on this so we can close the loop.\n\nTopic: ${item.title}\nOriginal request: ${item.request}\n${item.source ? `Source: ${item.source}\n` : ""}${item.lastAskedAt ? `Last asked: ${formatDateTimeValue(item.lastAskedAt)}\n` : ""}\nCan you please respond or confirm the next step?`;
}

function followThroughItemTemplate(item) {
  return `
    <div class="item agent-item ${item.status === "follow-up-due" ? "high" : "medium"}">
      <div class="item-header">
        <div>
          <p class="item-title">${escapeHtml(item.title)}</p>
          <p class="item-meta">${followUpStatusLabel(item.status)}${item.nextFollowUpAt ? ` · next ${formatDateTimeValue(item.nextFollowUpAt)}` : ""}</p>
        </div>
        <span class="pill ${item.status === "follow-up-due" ? "warn" : ""}">${followUpStatusLabel(item.status)}</span>
      </div>
      <p>${escapeHtml(item.request)}</p>
      <div class="item-actions">
        <button class="secondary" type="button" data-action="follow-up-again" data-id="${item.id}"><i data-lucide="send"></i><span>Ask again</span></button>
        <button class="ghost" type="button" data-action="follow-up-responded" data-id="${item.id}">Responded</button>
      </div>
    </div>
  `;
}

function renderAgentDesk() {
  const queue = agentQueueItems();
  const openFollowUps = state.followUps
    .filter((item) => !["responded", "closed"].includes(item.status))
    .sort((a, b) => (a.nextFollowUpAt || "").localeCompare(b.nextFollowUpAt || ""));
  const high = queue.filter((item) => item.priority === "high").length;
  const openPlannerTasks = Object.values(state.dailyPlans || {}).flatMap((plan) => plan.tasks || []).filter((task) => !task.done).length;
  const checks = meticulousCheckRows(queue);
  const score = Math.round((checks.filter((row) => row.pass).length / checks.length) * 100);
  $("#agentRiskLevel").textContent = high ? `${high} urgent` : queue.length ? "Active" : "Clear";
  $("#agentRiskLevel").className = `pill ${high ? "warn" : "good"}`;
  $("#agentQueueCount").textContent = `${queue.length} item${queue.length === 1 ? "" : "s"}`;
  $("#meticulousScore").textContent = `${score}%`;
  $("#meticulousScore").className = `pill ${score >= 75 ? "good" : "warn"}`;
  $("#meticulousChecks").innerHTML = checklistTemplate(checks);
  $("#agentBriefing").innerHTML = [
    `${queue.length} managed item${queue.length === 1 ? "" : "s"} need review across reminders, support, school, homework, and messages.`,
    `${openPlannerTasks} open planner task${openPlannerTasks === 1 ? "" : "s"} exist across daily sheets.`,
    high ? "Handle urgent items first, then draft only the messages that need a written record." : "No urgent queue items. Use intake to capture new work as it appears."
  ].map((line) => `<p class="briefing-line">${escapeHtml(line)}</p>`).join("");
  $("#agentQueue").innerHTML = queue.length
    ? queue.map(agentItemTemplate).join("")
    : emptyState("No active items. Capture a new issue or import WhatsApp messages.");
  $("#followThroughCount").textContent = `${openFollowUps.length} waiting`;
  $("#followThroughList").innerHTML = openFollowUps.length
    ? openFollowUps.slice(0, 8).map(followThroughItemTemplate).join("")
    : emptyState("No follow-ups loaded yet. Use Load follow-up preload and select private-active-followups-import.json.");
}

function findAgentItem(type, id) {
  return agentQueueItems().find((item) => item.type === type && item.id === id);
}

function addPlannerTaskFromAgent(item) {
  const plan = getPlan();
  const title = item.plannerTitle || item.title;
  if (plan.tasks.some((task) => task.title === title && !task.done)) return false;
  plan.tasks.push({
    id: crypto.randomUUID(),
    title,
    category: item.type === "chat" ? "Message" : item.type.charAt(0).toUpperCase() + item.type.slice(1),
    estimate: item.priority === "high" ? 3 : 2,
    actual: 0,
    done: false,
    createdAt: new Date().toISOString()
  });
  saveState();
  return true;
}

function draftChecks(text) {
  const trimmed = text.trim();
  return [
    {
      title: "States the purpose",
      detail: "The message should make the requested outcome obvious.",
      pass: /(confirm|request|asking|documenting|review|reply|plan|decision)/i.test(trimmed)
    },
    {
      title: "Uses facts, not accusations",
      detail: "Avoid always, never, fault, ridiculous, and similar escalation words.",
      pass: trimmed.length > 0 && chargedWordCount(trimmed) === 0
    },
    {
      title: "Includes a response path",
      detail: "Ask for confirmation, an alternative, or a specific reply.",
      pass: /(confirm|reply|please|alternative|what works|can you)/i.test(trimmed)
    },
    {
      title: "Concise enough to send",
      detail: "Keep the draft under 180 words unless documenting a complex issue.",
      pass: trimmed.split(/\s+/).filter(Boolean).length <= 180
    }
  ];
}

function autoRouteIssue(text) {
  const lowered = text.toLowerCase();
  if (/(childcare|watch|cover|coverage|babysit|during your time|support request)/.test(lowered)) return "support";
  if (/(homework|assignment|reading log|math|folder|submitted)/.test(lowered)) return "homework";
  if (/(school|application|teacher|class|enrollment|tour|form)/.test(lowered)) return "school";
  if (/(expense|receipt|reimburse|reimbursement|pay|payment|cost|invoice)/.test(lowered)) return "reminder";
  if (/(doctor|medical|health|therapy|dentist|appointment|medication)/.test(lowered)) return "reminder";
  if (/(pickup|dropoff|drop-off|schedule|calendar|exchange|time)/.test(lowered)) return "reminder";
  if (/(reply|respond|message|text|whatsapp|ask|confirm)/.test(lowered)) return "message";
  return "planner";
}

function quickTemplate(type) {
  return {
    childcare: {
      route: "support",
      text: "I need childcare support for ",
      evidence: "WhatsApp or calendar"
    },
    school: {
      route: "school",
      text: "We need to decide or follow up on school selection: ",
      evidence: "School portal or email"
    },
    homework: {
      route: "homework",
      text: "Homework needs monitoring or follow-up: ",
      evidence: "Homework folder or school portal"
    },
    schedule: {
      route: "reminder",
      text: "Schedule or exchange needs confirmation: ",
      evidence: "Calendar or WhatsApp"
    },
    expense: {
      route: "reminder",
      text: "Expense or reimbursement needs tracking: ",
      evidence: "Receipt or payment record"
    },
    healthcare: {
      route: "reminder",
      text: "Healthcare item needs follow-up: ",
      evidence: "Provider portal, referral, or appointment note"
    }
  }[type];
}

function plannerHours() {
  return Array.from({ length: 15 }, (_, index) => index + 6);
}

function hourLabel(hour) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 || 12;
  return `${display}:00 ${suffix}`;
}

function getPlan(date = state.selectedPlanDate || new Date().toISOString().slice(0, 10)) {
  if (!state.dailyPlans[date]) {
    state.dailyPlans[date] = {
      date,
      focus: "",
      tasks: [],
      schedule: {},
      interruptions: [],
      carryover: ""
    };
  }
  return state.dailyPlans[date];
}

function timeDots(actual, estimate) {
  const total = Math.max(Number(actual) || 0, Number(estimate) || 0, 1);
  return Array.from({ length: Math.min(total, 16) }, (_, index) => `<span class="time-dot ${index < actual ? "filled" : ""}"></span>`).join("");
}

function plannerTaskTemplate(task) {
  return `
    <div class="item planner-task ${task.done ? "done" : ""}" data-planner-task-id="${task.id}">
      <div class="planner-task-grid">
        <div>
          <p class="item-title">${escapeHtml(task.title)}</p>
          <p class="item-meta">${escapeHtml(task.category)} · estimate ${task.estimate} x 15 min · actual ${task.actual} x 15 min</p>
        </div>
        <span class="pill ${task.done ? "done" : ""}">${task.done ? "Done" : "Open"}</span>
      </div>
      <div class="time-blocks">${timeDots(task.actual, task.estimate)}</div>
      <div class="item-actions">
        <button class="ghost" type="button" data-action="planner-task-done" data-id="${task.id}">${task.done ? "Reopen" : "Done"}</button>
        <button class="ghost" type="button" data-action="planner-task-add-block" data-id="${task.id}">+15 min</button>
        <button class="ghost" type="button" data-action="planner-task-remove-block" data-id="${task.id}">-15 min</button>
        <button class="ghost danger" type="button" data-action="planner-task-delete" data-id="${task.id}">Delete</button>
      </div>
    </div>
  `;
}

function interruptionTemplate(item) {
  return `
    <div class="item" data-interruption-id="${item.id}">
      <div class="item-header">
        <p>${escapeHtml(item.text)}</p>
        <button class="ghost danger" type="button" data-action="planner-interruption-delete" data-id="${item.id}">Delete</button>
      </div>
      <p class="item-meta">${new Date(item.createdAt).toLocaleString()}</p>
    </div>
  `;
}

function renderPlanner() {
  const date = state.selectedPlanDate || new Date().toISOString().slice(0, 10);
  const plan = getPlan(date);
  $("#plannerDate").value = date;
  $("#plannerFocus").value = plan.focus || "";
  $("#plannerTaskList").innerHTML = plan.tasks.length
    ? plan.tasks.map(plannerTaskTemplate).join("")
    : emptyState("Pick three important co-parenting tasks for today.");
  $("#plannerInterruptions").innerHTML = plan.interruptions.length
    ? plan.interruptions.map(interruptionTemplate).join("")
    : emptyState("Unexpected requests and distractions will appear here.");
  $("#plannerCarryover").value = plan.carryover || "";
  $("#plannerSchedule").innerHTML = plannerHours().map((hour) => `
    <label class="schedule-row">
      <span class="schedule-hour">${hourLabel(hour)}</span>
      <input data-schedule-hour="${hour}" value="${escapeHtml(plan.schedule[hour] || "")}" placeholder="Block time, appointment, pickup, homework check" />
    </label>
  `).join("");
}

function renderDashboard() {
  const openReminders = state.reminders.filter((item) => !item.done);
  const openSupportRequests = state.supportRequests.filter((item) => ["requested", "no-response"].includes(item.status));
  const openHomework = state.homeworkItems.filter((item) => item.status !== "submitted");
  const schoolDecisions = state.schoolOptions.filter((item) => item.stage === "decision-needed");
  const now = Date.now();
  const soon = openReminders.filter((item) => {
    const due = new Date(item.time ? `${item.date}T${item.time}` : `${item.date}T23:59`).getTime();
    return due >= now && due <= now + 48 * 60 * 60 * 1000;
  });
  $("#openReminderCount").textContent = openReminders.length;
  $("#dueSoonCount").textContent = soon.length;
  $("#openSupportCount").textContent = openSupportRequests.length;
  $("#openHomeworkCount").textContent = openHomework.length;
  $("#schoolDecisionCount").textContent = schoolDecisions.length;
  $("#chatMessageCount").textContent = state.chatMessages.length;
  $("#followUpCount").textContent = state.followUps.filter((item) => !["responded", "closed"].includes(item.status)).length;

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

  const schoolItems = [
    ...sortByDateField(openHomework, "dueDate").slice(0, 3).map(homeworkItemTemplate),
    ...schoolDecisions.slice(0, 2).map(schoolItemTemplate)
  ];
  $("#schoolDashboardList").innerHTML = schoolItems.length
    ? schoolItems.join("")
    : emptyState("No open homework or school decisions.");
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

function schoolStageLabel(stage) {
  return {
    researching: "Researching",
    "tour-scheduled": "Tour scheduled",
    applied: "Applied",
    accepted: "Accepted",
    declined: "Declined",
    "decision-needed": "Decision needed"
  }[stage] || "Researching";
}

function schoolItemTemplate(item) {
  const statusClass = item.stage === "accepted" ? "good" : item.stage === "decision-needed" ? "warn" : "";
  const deadline = item.deadline ? ` · Deadline ${formatDateTimeValue(`${item.deadline}T12:00`)}` : "";
  return `
    <div class="item" data-school-id="${item.id}">
      <div class="item-header">
        <div>
          <p class="item-title">${escapeHtml(item.name)}</p>
          <p class="item-meta">${item.child ? `${escapeHtml(item.child)} · ` : ""}${escapeHtml(item.priority)} priority${deadline}</p>
        </div>
        <span class="pill ${statusClass}">${schoolStageLabel(item.stage)}</span>
      </div>
      ${item.notes ? `<p>${escapeHtml(item.notes)}</p>` : ""}
      <div class="item-actions">
        <button class="secondary" type="button" data-action="send-school" data-id="${item.id}"><i data-lucide="send"></i><span>WhatsApp</span></button>
        <button class="ghost" type="button" data-action="school-decision-needed" data-id="${item.id}">Decision needed</button>
        <button class="ghost danger" type="button" data-action="delete-school" data-id="${item.id}">Delete</button>
      </div>
    </div>
  `;
}

function renderSchoolOptions() {
  const filter = $("#schoolFilter").value;
  const filtered = sortByDateField(state.schoolOptions, "deadline").filter((item) => filter === "all" || item.stage === filter);
  $("#schoolList").innerHTML = filtered.length
    ? filtered.map(schoolItemTemplate).join("")
    : emptyState("No school options match this filter.");
}

function homeworkStatusLabel(status) {
  return {
    "not-started": "Not started",
    "in-progress": "In progress",
    "needs-help": "Needs help",
    submitted: "Submitted"
  }[status] || "Not started";
}

function homeworkItemTemplate(item) {
  const statusClass = item.status === "submitted" ? "good" : item.status === "needs-help" ? "warn" : "";
  return `
    <div class="item" data-homework-id="${item.id}">
      <div class="item-header">
        <div>
          <p class="item-title">${escapeHtml(item.title)}</p>
          <p class="item-meta">${item.child ? `${escapeHtml(item.child)} · ` : ""}${item.subject ? `${escapeHtml(item.subject)} · ` : ""}Due ${formatDateTimeValue(`${item.dueDate}T12:00`)}</p>
        </div>
        <span class="pill ${statusClass}">${homeworkStatusLabel(item.status)}</span>
      </div>
      ${item.notes ? `<p>${escapeHtml(item.notes)}</p>` : ""}
      <div class="item-actions">
        <button class="secondary" type="button" data-action="send-homework" data-id="${item.id}"><i data-lucide="send"></i><span>WhatsApp</span></button>
        <button class="ghost" type="button" data-action="homework-needs-help" data-id="${item.id}">Needs help</button>
        <button class="ghost" type="button" data-action="homework-submitted" data-id="${item.id}">Submitted</button>
        <button class="ghost danger" type="button" data-action="delete-homework" data-id="${item.id}">Delete</button>
      </div>
    </div>
  `;
}

function renderHomeworkItems() {
  const filter = $("#homeworkFilter").value;
  const filtered = sortByDateField(state.homeworkItems, "dueDate").filter((item) => {
    if (filter === "open") return item.status !== "submitted";
    if (filter === "all") return true;
    return item.status === filter;
  });
  $("#homeworkList").innerHTML = filtered.length
    ? filtered.map(homeworkItemTemplate).join("")
    : emptyState("No homework items match this filter.");
}

function chatCategoryFromName(name) {
  const lowered = name.toLowerCase();
  if (lowered.includes("calendar")) return "calendar";
  if (lowered.includes("household")) return "household";
  if (lowered.includes("expense")) return "expense";
  if (lowered.includes("gratitude")) return "gratitude";
  if (lowered.includes("healthcare")) return "healthcare";
  if (lowered.includes("co-parent")) return "central";
  return "direct";
}

function chatCategoryLabel(category) {
  return {
    calendar: "Calendar",
    household: "Household",
    expense: "Expense",
    gratitude: "Gratitude",
    healthcare: "Healthcare",
    central: "Co-Parent Central",
    direct: "Direct"
  }[category] || "Direct";
}

function parseWhatsAppDate(rawDate, rawTime, meridiem) {
  const [month, day, yearPart] = rawDate.split("/").map((part) => Number(part));
  let [hour, minute, second] = rawTime.split(":").map((part) => Number(part));
  const year = yearPart < 100 ? 2000 + yearPart : yearPart;
  if (meridiem) {
    const marker = meridiem.toUpperCase();
    if (marker === "PM" && hour < 12) hour += 12;
    if (marker === "AM" && hour === 12) hour = 0;
  }
  return new Date(year, month - 1, day, hour, minute, second || 0).toISOString();
}

function parseWhatsAppText(text, sourceName) {
  const category = chatCategoryFromName(sourceName);
  const entries = [];
  const lines = text.replace(/\r\n/g, "\n").replace(/\u202f/g, " ").split("\n");
  const startPattern = /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*([AP]M)?\]\s([^:]+):\s([\s\S]*)$/i;
  for (const line of lines) {
    const match = line.match(startPattern);
    if (match) {
      entries.push({
        id: crypto.randomUUID(),
        source: sourceName,
        category,
        timestamp: parseWhatsAppDate(match[1], match[2], match[3]),
        sender: match[4].trim(),
        text: match[5].trim()
      });
    } else if (entries.length && line.trim()) {
      entries[entries.length - 1].text += `\n${line.trim()}`;
    }
  }
  return entries.filter((entry) => entry.text && !entry.text.includes("<Media omitted>"));
}

function chatItemTemplate(item) {
  return `
    <div class="item" data-chat-id="${item.id}">
      <div class="item-header">
        <div>
          <p class="item-title">${escapeHtml(item.sender)}</p>
          <p class="item-meta">${chatCategoryLabel(item.category)} · ${new Date(item.timestamp).toLocaleString()} · ${escapeHtml(item.source)}</p>
        </div>
        <span class="pill">${chatCategoryLabel(item.category)}</span>
      </div>
      <p>${escapeHtml(item.text)}</p>
      <div class="item-actions">
        <button class="ghost" type="button" data-action="log-chat-message" data-id="${item.id}">Add to communication log</button>
        <button class="secondary" type="button" data-action="draft-from-chat" data-id="${item.id}"><i data-lucide="wand-2"></i><span>Draft reply</span></button>
      </div>
    </div>
  `;
}

function renderChatImports() {
  const search = $("#chatSearch").value.trim().toLowerCase();
  const category = $("#chatCategoryFilter").value;
  const sender = $("#chatSenderFilter").value.trim().toLowerCase();
  const filtered = state.chatMessages.filter((item) => {
    const matchesCategory = category === "all" || item.category === category;
    const matchesSender = !sender || item.sender.toLowerCase().includes(sender);
    const matchesSearch = !search || [item.sender, item.text, item.source, item.category].join(" ").toLowerCase().includes(search);
    return matchesCategory && matchesSender && matchesSearch;
  }).slice(0, 100);
  $("#chatImportCount").textContent = `${state.chatMessages.length} message${state.chatMessages.length === 1 ? "" : "s"}`;
  $("#chatImportList").innerHTML = filtered.length
    ? filtered.map(chatItemTemplate).join("")
    : emptyState("No imported messages match this filter.");
}

async function readWhatsAppFile(file) {
  if (file.name.toLowerCase().endsWith(".txt")) {
    return parseWhatsAppText(await file.text(), file.name);
  }
  if (!window.JSZip) throw new Error("ZIP support is still loading. Try again in a moment.");
  const zip = await window.JSZip.loadAsync(file);
  const chatFileName = Object.keys(zip.files).find((name) => name.toLowerCase().endsWith("_chat.txt"));
  if (!chatFileName) return [];
  const text = await zip.files[chatFileName].async("text");
  return parseWhatsAppText(text, file.name.replace(/\.zip$/i, ""));
}

function dedupeChatMessages(messages) {
  const seen = new Set();
  return messages.filter((item) => {
    const key = `${item.source}|${item.timestamp}|${item.sender}|${item.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeById(existing = [], incoming = []) {
  const items = new Map(existing.map((item) => [item.id, item]));
  incoming.forEach((item) => items.set(item.id, item));
  return [...items.values()];
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

async function importJsonFile(file) {
  const imported = JSON.parse(await file.text());
  const isProfileOnly = imported.settings && !["reminders", "agreements", "supportRequests", "schoolOptions", "homeworkItems", "messages"].some((key) => key in imported);
  const isChatArchiveOnly = Array.isArray(imported.chatMessages) && Object.keys(imported).every((key) => key === "chatMessages");
  const isMergeImport = imported.merge === true;
  if (isProfileOnly) {
    state = {
      ...state,
      settings: {
        ...state.settings,
        ...imported.settings
      }
    };
    return "Profile imported";
  }
  if (isChatArchiveOnly) {
    state = {
      ...state,
      chatMessages: dedupeChatMessages([...state.chatMessages, ...imported.chatMessages])
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    };
    return "Chat archive imported";
  }
  if (isMergeImport) {
    state = {
      ...state,
      settings: {
        ...state.settings,
        ...imported.settings
      },
      reminders: mergeById(state.reminders, imported.reminders),
      agreements: mergeById(state.agreements, imported.agreements),
      supportRequests: mergeById(state.supportRequests, imported.supportRequests),
      schoolOptions: mergeById(state.schoolOptions, imported.schoolOptions),
      homeworkItems: mergeById(state.homeworkItems, imported.homeworkItems),
      followUps: mergeById(state.followUps, imported.followUps),
      messages: mergeById(state.messages, imported.messages),
      chatMessages: dedupeChatMessages([...state.chatMessages, ...(imported.chatMessages || [])])
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
      dailyPlans: {
        ...state.dailyPlans,
        ...imported.dailyPlans
      },
      selectedPlanDate: imported.selectedPlanDate || state.selectedPlanDate
    };
    return "Data merged";
  }
  state = {
    ...structuredClone(defaultState),
    ...imported,
    settings: {
      ...defaultState.settings,
      ...imported.settings
    }
  };
  return "Data imported";
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
  $all("[data-agent-template]").forEach((button) => {
    button.addEventListener("click", () => {
      const template = quickTemplate(button.dataset.agentTemplate);
      const form = $("#agentIntakeForm");
      form.route.value = template.route;
      form.text.value = template.text;
      form.evidence.value = template.evidence;
      form.text.focus();
    });
  });

  $("#agentIntakeForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const text = data.text.trim();
    const route = data.route === "auto" ? autoRouteIssue(text) : data.route;
    const evidenceLine = data.evidence?.trim() ? `\nEvidence/source: ${data.evidence.trim()}` : "";
    const neededLine = data.neededBy ? `\nNeeded by: ${formatDateTimeValue(data.neededBy)}` : "";
    const routedText = `${text}${evidenceLine}${neededLine}`;
    const dueDate = data.neededBy ? data.neededBy.slice(0, 10) : new Date().toISOString().slice(0, 10);
    if (route === "support") {
      state.supportRequests.unshift({
        id: crypto.randomUUID(),
        reason: text,
        child: "",
        parentingTime: "other",
        start: data.neededBy || new Date().toISOString().slice(0, 16),
        end: "",
        request: routedText,
        response: "",
        status: "requested",
        requestedAt: new Date().toISOString().slice(0, 16),
        createdAt: new Date().toISOString()
      });
    }
    if (route === "homework") {
      state.homeworkItems.unshift({
        id: crypto.randomUUID(),
        title: text,
        child: "",
        subject: "",
        dueDate,
        status: "needs-help",
        notes: routedText,
        createdAt: new Date().toISOString()
      });
    }
    if (route === "school") {
      state.schoolOptions.unshift({
        id: crypto.randomUUID(),
        name: text,
        child: "",
        stage: "decision-needed",
        deadline: dueDate,
        priority: data.priority,
        notes: routedText,
        createdAt: new Date().toISOString()
      });
    }
    if (route === "reminder") {
      state.reminders.push({
        id: crypto.randomUUID(),
        title: text,
        child: "",
        category: "Other",
        date: dueDate,
        time: data.neededBy ? data.neededBy.slice(11, 16) : "",
        details: routedText,
        done: false,
        createdAt: new Date().toISOString()
      });
    }
    if (route === "message") {
      switchView("mediator");
      $("#messageForm").topic.value = `${data.priority} priority follow-up`;
      $("#messageForm").facts.value = routedText;
      $("#draftText").value = generateDraft({
        topic: `${data.priority} priority follow-up`,
        facts: routedText,
        goal: "deescalate",
        tone: data.priority === "high" ? "firm" : "brief"
      });
      updateDraftActions($("#draftText").value);
      showToast("Draft prepared");
    } else {
      const plan = getPlan();
      plan.tasks.push({
        id: crypto.randomUUID(),
        title: routedText,
        category: route === "planner" ? "Message" : route.charAt(0).toUpperCase() + route.slice(1),
        estimate: data.priority === "high" ? 3 : 2,
        actual: 0,
        done: false,
        createdAt: new Date().toISOString()
      });
      saveState();
      render();
      showToast(`Managed as ${route}`);
    }
    event.currentTarget.reset();
  });

  $("#plannerDate").addEventListener("change", (event) => {
    state.selectedPlanDate = event.target.value || new Date().toISOString().slice(0, 10);
    getPlan(state.selectedPlanDate);
    saveState();
    render();
  });

  $("#plannerFocus").addEventListener("change", (event) => {
    getPlan().focus = event.target.value.trim();
    saveState();
  });

  $("#plannerTaskForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    getPlan().tasks.push({
      id: crypto.randomUUID(),
      title: data.title.trim(),
      category: data.category,
      estimate: Number(data.estimate) || 1,
      actual: 0,
      done: false,
      createdAt: new Date().toISOString()
    });
    saveState();
    event.currentTarget.reset();
    event.currentTarget.estimate.value = 2;
    render();
    showToast("Planner task added");
  });

  $("#plannerInterruptionForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    getPlan().interruptions.unshift({
      id: crypto.randomUUID(),
      text: data.text.trim(),
      createdAt: new Date().toISOString()
    });
    saveState();
    event.currentTarget.reset();
    render();
    showToast("Interruption logged");
  });

  $("#plannerCarryover").addEventListener("change", (event) => {
    getPlan().carryover = event.target.value.trim();
    saveState();
  });

  $("#plannerSchedule").addEventListener("change", (event) => {
    const input = event.target.closest("[data-schedule-hour]");
    if (!input) return;
    getPlan().schedule[input.dataset.scheduleHour] = input.value.trim();
    saveState();
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

  $("#schoolForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    state.schoolOptions.unshift({
      id: crypto.randomUUID(),
      name: data.name.trim(),
      child: data.child.trim(),
      stage: data.stage,
      deadline: data.deadline,
      priority: data.priority,
      notes: data.notes.trim(),
      createdAt: new Date().toISOString()
    });
    saveState();
    event.currentTarget.reset();
    render();
    showToast("School option saved");
  });

  $("#schoolFilter").addEventListener("change", renderSchoolOptions);

  $("#homeworkForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    state.homeworkItems.unshift({
      id: crypto.randomUUID(),
      title: data.title.trim(),
      child: data.child.trim(),
      subject: data.subject.trim(),
      dueDate: data.dueDate,
      status: data.status,
      notes: data.notes.trim(),
      createdAt: new Date().toISOString()
    });
    saveState();
    event.currentTarget.reset();
    render();
    showToast("Homework item saved");
  });

  $("#homeworkFilter").addEventListener("change", renderHomeworkItems);

  $("#whatsappImport").addEventListener("change", async (event) => {
    const files = [...event.target.files];
    if (!files.length) return;
    try {
      const imported = [];
      for (const file of files) {
        imported.push(...await readWhatsAppFile(file));
      }
      state.chatMessages = dedupeChatMessages([...state.chatMessages, ...imported])
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      saveState();
      render();
      showToast(`Imported ${imported.length} message${imported.length === 1 ? "" : "s"}`);
    } catch (error) {
      showToast(error.message || "WhatsApp import failed");
    } finally {
      event.target.value = "";
    }
  });

  $("#chatSearch").addEventListener("input", renderChatImports);
  $("#chatCategoryFilter").addEventListener("change", renderChatImports);
  $("#chatSenderFilter").addEventListener("input", renderChatImports);

  $("#clearChatImports").addEventListener("click", () => {
    state.chatMessages = [];
    saveState();
    render();
    showToast("Imported chats cleared");
  });

  $("#exportChatImports").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ chatMessages: state.chatMessages }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `parent-manager-whatsapp-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  });

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const { action, id } = button.dataset;
    if (action === "planner-task-done") {
      const task = getPlan().tasks.find((item) => item.id === id);
      task.done = !task.done;
      saveState();
      render();
    }
    if (action === "planner-task-add-block") {
      const task = getPlan().tasks.find((item) => item.id === id);
      task.actual = Math.min((Number(task.actual) || 0) + 1, 16);
      saveState();
      render();
    }
    if (action === "planner-task-remove-block") {
      const task = getPlan().tasks.find((item) => item.id === id);
      task.actual = Math.max((Number(task.actual) || 0) - 1, 0);
      saveState();
      render();
    }
    if (action === "planner-task-delete") {
      const plan = getPlan();
      plan.tasks = plan.tasks.filter((item) => item.id !== id);
      saveState();
      render();
      showToast("Planner task deleted");
    }
    if (action === "planner-interruption-delete") {
      const plan = getPlan();
      plan.interruptions = plan.interruptions.filter((item) => item.id !== id);
      saveState();
      render();
      showToast("Interruption deleted");
    }
    if (action === "agent-build-plan") {
      const queue = agentQueueItems().slice(0, 5);
      const added = queue.filter(addPlannerTaskFromAgent).length;
      render();
      switchView("planner");
      showToast(`Added ${added} item${added === 1 ? "" : "s"} to today's plan`);
    }
    if (action === "agent-plan-item") {
      const item = findAgentItem(button.dataset.agentType, id);
      if (!item) return;
      const added = addPlannerTaskFromAgent(item);
      render();
      showToast(added ? "Added to today's plan" : "Already in today's plan");
    }
    if (action === "agent-draft-item") {
      const item = findAgentItem(button.dataset.agentType, id);
      if (!item) return;
      switchView("mediator");
      $("#messageForm").topic.value = item.title;
      $("#messageForm").facts.value = item.facts;
      $("#draftText").value = generateDraft({
        topic: item.title,
        facts: item.facts,
        goal: item.priority === "high" ? "request" : "confirm",
        tone: item.priority === "high" ? "firm" : "brief"
      });
      updateDraftActions($("#draftText").value);
      showToast("Draft prepared");
    }
    if (action === "agent-open-item") {
      switchView(button.dataset.view);
    }
    if (action === "follow-up-responded") {
      const item = state.followUps.find((followUp) => followUp.id === id);
      item.status = "responded";
      item.respondedAt = new Date().toISOString();
      saveState();
      render();
      showToast("Follow-up marked responded");
    }
    if (action === "follow-up-again") {
      const item = state.followUps.find((followUp) => followUp.id === id);
      item.status = "waiting";
      item.lastAskedAt = new Date().toISOString();
      item.nextFollowUpAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      saveState();
      switchView("mediator");
      $("#messageForm").topic.value = item.title;
      $("#messageForm").facts.value = followUpMessage(item);
      $("#draftText").value = generateDraft({
        topic: item.title,
        facts: followUpMessage(item),
        goal: "request",
        tone: "firm"
      });
      updateDraftActions($("#draftText").value);
      showToast("Follow-up draft prepared");
    }
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
    if (action === "send-school") {
      const option = state.schoolOptions.find((item) => item.id === id);
      window.open(whatsappUrl(schoolDecisionMessage(option)), "_blank", "noreferrer");
    }
    if (action === "school-decision-needed") {
      const option = state.schoolOptions.find((item) => item.id === id);
      option.stage = "decision-needed";
      saveState();
      render();
    }
    if (action === "delete-school") {
      state.schoolOptions = state.schoolOptions.filter((item) => item.id !== id);
      saveState();
      render();
      showToast("School option deleted");
    }
    if (action === "send-homework") {
      const item = state.homeworkItems.find((homework) => homework.id === id);
      window.open(whatsappUrl(homeworkMessage(item)), "_blank", "noreferrer");
    }
    if (action === "homework-needs-help") {
      const item = state.homeworkItems.find((homework) => homework.id === id);
      item.status = "needs-help";
      saveState();
      render();
    }
    if (action === "homework-submitted") {
      const item = state.homeworkItems.find((homework) => homework.id === id);
      item.status = "submitted";
      saveState();
      render();
    }
    if (action === "delete-homework") {
      state.homeworkItems = state.homeworkItems.filter((item) => item.id !== id);
      saveState();
      render();
      showToast("Homework item deleted");
    }
    if (action === "log-chat-message") {
      const item = state.chatMessages.find((message) => message.id === id);
      state.messages.unshift({
        id: crypto.randomUUID(),
        topic: `${chatCategoryLabel(item.category)} WhatsApp message`,
        text: `${item.sender} (${new Date(item.timestamp).toLocaleString()}):\n${item.text}`,
        createdAt: new Date().toISOString()
      });
      saveState();
      render();
      showToast("Message added to log");
    }
    if (action === "draft-from-chat") {
      const item = state.chatMessages.find((message) => message.id === id);
      switchView("mediator");
      $("#messageForm").topic.value = `${chatCategoryLabel(item.category)} follow-up`;
      $("#messageForm").facts.value = `${item.sender} wrote on ${new Date(item.timestamp).toLocaleString()}:\n${item.text}`;
      $("#draftText").value = generateDraft({
        topic: `${chatCategoryLabel(item.category)} follow-up`,
        facts: $("#messageForm").facts.value,
        goal: "deescalate",
        tone: "brief"
      });
      updateDraftActions($("#draftText").value);
      showToast("Draft created from WhatsApp message");
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
      const message = await importJsonFile(file);
      saveState();
      render();
      showToast(message);
    } catch {
      showToast("Import failed");
    } finally {
      event.target.value = "";
    }
  });

  $("#followupImport").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const message = await importJsonFile(file);
      saveState();
      render();
      showToast(message);
    } catch {
      showToast("Follow-up import failed");
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
  $("#draftChecklist").innerHTML = checklistTemplate(draftChecks(trimmed));
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
