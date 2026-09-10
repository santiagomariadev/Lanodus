const state = {
  token: localStorage.getItem("token") || "",
  username: localStorage.getItem("username") || "",
  selectedFile: null,
};

const loginCard = document.getElementById("login-card");
const dashboard = document.getElementById("dashboard");
const loginForm = document.getElementById("login-form");
const logoutBtn = document.getElementById("logout-btn");
const currentUserEl = document.getElementById("current-user");

const tabs = Array.from(document.querySelectorAll(".tab"));
const tabFiles = document.getElementById("tab-files");
const tabText = document.getElementById("tab-text");

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");
const selectedFileEl = document.getElementById("selected-file");
const uploadFileBtn = document.getElementById("upload-file-btn");

const textForm = document.getElementById("text-form");
const textInput = document.getElementById("text-input");
const textRows = document.getElementById("text-rows");

const toastContainer = document.getElementById("toast-container");

function showToast(message, type = "ok") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 2600);
}

function setAuthedView() {
  const authed = Boolean(state.token && state.username);
  loginCard.classList.toggle("hidden", authed);
  dashboard.classList.toggle("hidden", !authed);
  currentUserEl.textContent = state.username;
}

function setActiveTab(tab) {
  tabs.forEach((btn) => {
    const active = btn.dataset.tab === tab;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
  });
  tabFiles.classList.toggle("hidden", tab !== "files");
  tabText.classList.toggle("hidden", tab !== "text");
}

function authHeaders(extra = {}) {
  return {
    ...extra,
    Authorization: `Bearer ${state.token}`,
  };
}

async function api(url, options = {}) {
  const res = await fetch(url, options);
  if (res.status === 401) {
    logout();
    throw new Error("Session expired. Please login again.");
  }
  return res;
}

function logout() {
  state.token = "";
  state.username = "";
  localStorage.removeItem("token");
  localStorage.removeItem("username");
  setAuthedView();
}

async function login(username, password) {
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  const payload = await res.json();

  if (!res.ok) {
    throw new Error(payload.error || "Login failed");
  }

  state.token = payload.token;
  state.username = payload.username;
  localStorage.setItem("token", state.token);
  localStorage.setItem("username", state.username);
  setAuthedView();
  await loadTexts();
}

function setSelectedFile(file) {
  state.selectedFile = file;
  selectedFileEl.textContent = file ? file.name : "None";
}

async function uploadSelectedFile() {
  if (!state.selectedFile) {
    showToast("Pick a file first", "err");
    return;
  }

  const form = new FormData();
  form.append("file", state.selectedFile);

  const res = await api("/api/upload-file", {
    method: "POST",
    headers: authHeaders(),
    body: form,
  });

  const payload = await res.json();
  if (!res.ok) {
    throw new Error(payload.error || "File upload failed");
  }

  showToast("File uploaded", "ok");
  fileInput.value = "";
  setSelectedFile(null);
}

async function uploadText(text) {
  const res = await api("/api/upload-text", {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ text }),
  });

  const payload = await res.json();
  if (!res.ok) {
    throw new Error(payload.error || "Text upload failed");
  }

  showToast("Text uploaded", "ok");
}

async function loadTexts() {
  const res = await api("/api/texts?limit=40", {
    headers: authHeaders(),
  });

  const payload = await res.json();
  if (!res.ok) {
    throw new Error(payload.error || "Could not load texts");
  }

  renderTextRows(payload.items || []);
}

function renderTextRows(items) {
  textRows.innerHTML = "";

  if (!items.length) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="3">No uploaded text yet.</td>';
    textRows.appendChild(row);
    return;
  }

  for (const item of items) {
    const row = document.createElement("tr");

    const dateCell = document.createElement("td");
    const textCell = document.createElement("td");
    const actionCell = document.createElement("td");

    dateCell.textContent = new Date(item.at).toLocaleString();
    textCell.textContent = item.text;

    const copyBtn = document.createElement("button");
    copyBtn.className = "small-btn";
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(item.text);
        showToast("Copied to clipboard", "ok");
      } catch {
        showToast("Cannot access clipboard", "err");
      }
    });

    actionCell.appendChild(copyBtn);
    row.appendChild(dateCell);
    row.appendChild(textCell);
    row.appendChild(actionCell);

    textRows.appendChild(row);
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");

  try {
    await login(username, password);
    showToast("Welcome", "ok");
  } catch (error) {
    showToast(error.message || "Login failed", "err");
  }
});

logoutBtn.addEventListener("click", () => {
  logout();
});

tabs.forEach((tabBtn) => {
  tabBtn.addEventListener("click", async () => {
    const tab = tabBtn.dataset.tab;
    setActiveTab(tab);
    if (tab === "text" && state.token) {
      try {
        await loadTexts();
      } catch (error) {
        showToast(error.message || "Failed to load text", "err");
      }
    }
  });
});

fileInput.addEventListener("change", () => {
  setSelectedFile(fileInput.files?.[0] || null);
});

dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropzone.classList.add("dragover");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("dragover");
});

dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropzone.classList.remove("dragover");
  const file = event.dataTransfer?.files?.[0] || null;
  if (file) {
    setSelectedFile(file);
  }
});

uploadFileBtn.addEventListener("click", async () => {
  try {
    await uploadSelectedFile();
  } catch (error) {
    showToast(error.message || "Upload failed", "err");
  }
});

textForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = textInput.value.trim();
  if (!text) {
    showToast("Text cannot be empty", "err");
    return;
  }

  try {
    await uploadText(text);
    textInput.value = "";
    await loadTexts();
  } catch (error) {
    showToast(error.message || "Upload failed", "err");
  }
});

setAuthedView();
setActiveTab("files");

if (state.token && state.username) {
  loadTexts().catch(() => {
    logout();
  });
}
