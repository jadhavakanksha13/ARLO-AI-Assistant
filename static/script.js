const state = {
  currentModule: "aichat",
  enterToSend: true,
  showTimestamps: false,
  isWaiting: false,
};

const MODULE_TITLES = {
  aichat: "AI Chat",
  faq: "FAQ Assistant",
  calculator: "Calculator",
  study: "Study Help",
  notes: "Notes",
  planner: "Planner",
};

const welcomeScreen = document.getElementById("welcomeScreen");
const chatPanel = document.getElementById("chatPanel");
const notesPanel = document.getElementById("notesPanel");
const plannerPanel = document.getElementById("plannerPanel");
const chatMessages = document.getElementById("chatMessages");
const chatTitle = document.getElementById("chatTitle");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const newChatBtn = document.getElementById("newChatBtn");
const clearChatBtn = document.getElementById("clearChatBtn");
const navItems = document.querySelectorAll(".nav-item");
const suggestionCards = document.querySelectorAll(".suggestion-card");
const settingsModal = document.getElementById("settingsModal");
const aboutModal = document.getElementById("aboutModal");
const settingsBtn = document.getElementById("settingsBtn");
const aboutBtn = document.getElementById("aboutBtn");
const noteInput = document.getElementById("noteInput");
const addNoteBtn = document.getElementById("addNoteBtn");
const notesList = document.getElementById("notesList");
const taskInput = document.getElementById("taskInput");
const addTaskBtn = document.getElementById("addTaskBtn");
const plannerList = document.getElementById("plannerList");

function getSavedTheme() {
  return localStorage.getItem("arlo_theme") || "light";
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("arlo_theme", theme);
  document.querySelectorAll(".seg-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.theme === theme);
  });
}

function hideAllPanels() {
  welcomeScreen.classList.remove("visible");
  chatPanel.classList.remove("visible");
  notesPanel.classList.remove("visible");
  plannerPanel.classList.remove("visible");
}

function selectModule(module) {
  state.currentModule = module;
  hideAllPanels();

  navItems.forEach((item) => {
    item.classList.toggle("active", item.dataset.module === module);
  });

  if (module === "notes") {
    notesPanel.classList.add("visible");
    renderNotes();
    return;
  }

  if (module === "planner") {
    plannerPanel.classList.add("visible");
    renderTasks();
    return;
  }

  chatPanel.classList.add("visible");
  chatTitle.textContent = MODULE_TITLES[module] || "AI Chat";

  if (chatMessages.children.length === 0) {
    const welcomeText = {
      aichat: "Hi! I'm ARLO. Ask me anything, and I'll help naturally.",
      faq: "Ask me a question and I’ll check the college FAQ knowledge base.",
      calculator: "Try a calculation like 89 + 78 or 25% of 800.",
      study: "Tell me a topic you're studying, and I’ll explain it clearly.",
    };
    appendMessage(welcomeText[module] || "How can I help you today?", "bot", false);
  }

  messageInput.focus();
  adjustTextareaHeight();
}

function showWelcome() {
  hideAllPanels();
  welcomeScreen.classList.add("visible");
  navItems.forEach((item) => item.classList.remove("active"));
  state.currentModule = "aichat";
}

function getChatHistory() {
  try {
    return JSON.parse(localStorage.getItem("arlo_chat_history")) || [];
  } catch {
    return [];
  }
}

function saveChatHistory(history) {
  localStorage.setItem("arlo_chat_history", JSON.stringify(history));
}

function appendMessage(text, sender, persist = true) {
  const messageEl = document.createElement("div");
  messageEl.className = `message ${sender}`;

  if (state.showTimestamps) {
    const stamp = document.createElement("div");
    stamp.className = "message-time";
    stamp.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    messageEl.appendChild(stamp);
  }

  const content = document.createElement("div");
  content.className = "message-text";
  content.textContent = text;
  messageEl.appendChild(content);

  chatMessages.appendChild(messageEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  if (persist) {
    const history = getChatHistory();
    history.push({ sender, text, module: state.currentModule, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) });
    saveChatHistory(history);
  }
}

function restoreChatHistory() {
  const history = getChatHistory();
  if (!history.length) {
    showWelcome();
    return;
  }

  const lastModule = history[history.length - 1].module || "aichat";
  state.currentModule = lastModule;
  selectModule(lastModule);
  chatMessages.innerHTML = "";

  history.forEach((item) => {
    const temp = document.createElement("div");
    temp.className = `message ${item.sender}`;
    if (state.showTimestamps) {
      const stamp = document.createElement("div");
      stamp.className = "message-time";
      stamp.textContent = item.time || "";
      temp.appendChild(stamp);
    }
    const content = document.createElement("div");
    content.className = "message-text";
    content.textContent = item.text;
    temp.appendChild(content);
    chatMessages.appendChild(temp);
  });

  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showTypingIndicator() {
  const typing = document.createElement("div");
  typing.className = "typing-indicator";
  typing.id = "typingIndicator";
  typing.innerHTML = "<span></span><span></span><span></span>";
  chatMessages.appendChild(typing);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function hideTypingIndicator() {
  const el = document.getElementById("typingIndicator");
  if (el) el.remove();
}

async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || state.isWaiting) return;

  state.isWaiting = true;
  sendBtn.disabled = true;
  appendMessage(text, "user");
  messageInput.value = "";
  adjustTextareaHeight();
  showTypingIndicator();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, module: state.currentModule || "aichat" })
    });

    if (!response.ok) throw new Error("Request failed");
    const data = await response.json();
    hideTypingIndicator();
    appendMessage(data.reply, "bot");
  } catch (error) {
    hideTypingIndicator();
    appendMessage("I'm having trouble connecting right now. Please try again in a moment.", "bot");
  } finally {
    state.isWaiting = false;
    sendBtn.disabled = false;
  }
}

function newChat() {
  chatMessages.innerHTML = "";
  saveChatHistory([]);
  showWelcome();
  state.currentModule = "aichat";
}

function clearChat() {
  chatMessages.innerHTML = "";
  saveChatHistory([]);
  appendMessage("Hi! I'm ARLO. Ask me anything, and I'll help naturally.", "bot", false);
}

function adjustTextareaHeight() {
  messageInput.style.height = "auto";
  const maxHeight = 140;
  const newHeight = Math.min(messageInput.scrollHeight, maxHeight);
  messageInput.style.height = `${newHeight}px`;
}

function openModal(modal) {
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal(modal) {
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
}

function bindSettings() {
  document.querySelectorAll(".seg-btn").forEach((button) => {
    button.addEventListener("click", () => {
      applyTheme(button.dataset.theme);
    });
  });

  document.getElementById("enterToSend").addEventListener("change", (event) => {
    state.enterToSend = event.target.checked;
    localStorage.setItem("arlo_enter_to_send", String(state.enterToSend));
  });

  document.getElementById("showTimestamps").addEventListener("change", (event) => {
    state.showTimestamps = event.target.checked;
    localStorage.setItem("arlo_show_timestamps", String(state.showTimestamps));
    restoreChatHistory();
  });

  document.querySelectorAll("[data-close]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.close === "settings" ? settingsModal : aboutModal;
      closeModal(target);
    });
  });

  settingsModal.addEventListener("click", (event) => {
    if (event.target === settingsModal) closeModal(settingsModal);
  });

  aboutModal.addEventListener("click", (event) => {
    if (event.target === aboutModal) closeModal(aboutModal);
  });
}

function bindNotesAndPlanner() {
  addNoteBtn.addEventListener("click", () => {
    const value = noteInput.value.trim();
    if (!value) return;
    const notes = JSON.parse(localStorage.getItem("arlo_notes") || "[]");
    notes.unshift({ id: Date.now(), text: value });
    localStorage.setItem("arlo_notes", JSON.stringify(notes));
    noteInput.value = "";
    renderNotes();
  });

  noteInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addNoteBtn.click();
    }
  });

  addTaskBtn.addEventListener("click", () => {
    const value = taskInput.value.trim();
    if (!value) return;
    const tasks = JSON.parse(localStorage.getItem("arlo_tasks") || "[]");
    tasks.unshift({ id: Date.now(), text: value, done: false });
    localStorage.setItem("arlo_tasks", JSON.stringify(tasks));
    taskInput.value = "";
    renderTasks();
  });

  taskInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addTaskBtn.click();
    }
  });
}

function renderNotes() {
  const notes = JSON.parse(localStorage.getItem("arlo_notes") || "[]");
  notesList.innerHTML = "";

  if (!notes.length) {
    notesList.innerHTML = '<div class="empty-state">No notes yet. Add one above.</div>';
    return;
  }

  notes.forEach((note) => {
    const row = document.createElement("div");
    row.className = "panel-item";
    row.innerHTML = `
      <span class="item-text">${note.text}</span>
      <button class="delete-item" type="button" aria-label="Delete note">🗑</button>
    `;
    row.querySelector(".delete-item").addEventListener("click", () => {
      const remaining = JSON.parse(localStorage.getItem("arlo_notes") || "[]").filter((item) => item.id !== note.id);
      localStorage.setItem("arlo_notes", JSON.stringify(remaining));
      renderNotes();
    });
    notesList.appendChild(row);
  });
}

function renderTasks() {
  const tasks = JSON.parse(localStorage.getItem("arlo_tasks") || "[]");
  plannerList.innerHTML = "";

  if (!tasks.length) {
    plannerList.innerHTML = '<div class="empty-state">No tasks yet. Add one above.</div>';
    return;
  }

  tasks.forEach((task) => {
    const row = document.createElement("div");
    row.className = `panel-item ${task.done ? "done" : ""}`;
    row.innerHTML = `
      <input type="checkbox" ${task.done ? "checked" : ""} aria-label="Toggle task" />
      <span class="item-text">${task.text}</span>
      <button class="delete-item" type="button" aria-label="Delete task">🗑</button>
    `;
    const checkbox = row.querySelector('input[type="checkbox"]');
    checkbox.addEventListener("change", () => {
      const updated = JSON.parse(localStorage.getItem("arlo_tasks") || "[]").map((item) => item.id === task.id ? { ...item, done: !item.done } : item);
      localStorage.setItem("arlo_tasks", JSON.stringify(updated));
      renderTasks();
    });
    row.querySelector(".delete-item").addEventListener("click", () => {
      const remaining = JSON.parse(localStorage.getItem("arlo_tasks") || "[]").filter((item) => item.id !== task.id);
      localStorage.setItem("arlo_tasks", JSON.stringify(remaining));
      renderTasks();
    });
    plannerList.appendChild(row);
  });
}

navItems.forEach((item) => {
  item.addEventListener("click", () => selectModule(item.dataset.module));
});

suggestionCards.forEach((button) => {
  button.addEventListener("click", () => {
    const prompt = button.dataset.prompt;
    selectModule("aichat");
    messageInput.value = prompt;
    adjustTextareaHeight();
    messageInput.focus();
  });
});

newChatBtn.addEventListener("click", newChat);
clearChatBtn.addEventListener("click", clearChat);
settingsBtn.addEventListener("click", () => openModal(settingsModal));
aboutBtn.addEventListener("click", () => openModal(aboutModal));

sendBtn.addEventListener("click", sendMessage);
messageInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && state.enterToSend) {
    event.preventDefault();
    sendMessage();
  }
});
messageInput.addEventListener("input", adjustTextareaHeight);

function loadSettings() {
  const theme = getSavedTheme();
  applyTheme(theme);

  const enterSetting = localStorage.getItem("arlo_enter_to_send");
  state.enterToSend = enterSetting === null ? true : enterSetting === "true";
  document.getElementById("enterToSend").checked = state.enterToSend;

  const showTs = localStorage.getItem("arlo_show_timestamps");
  state.showTimestamps = showTs === "true";
  document.getElementById("showTimestamps").checked = state.showTimestamps;
}

loadSettings();
bindSettings();
bindNotesAndPlanner();
showWelcome();
renderNotes();
renderTasks();
restoreChatHistory();
