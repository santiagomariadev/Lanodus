const isElectron = Boolean(window.localShareApi);

const state = {
  token: localStorage.getItem("token") || "",
  username: localStorage.getItem("username") || "",
  selectedFile: null,
  desktopMode: "host",
};

const loginCard = document.getElementById("login-card");
const dashboard = document.getElementById("dashboard");
const loginForm = document.getElementById("login-form");
const logoutBtn = document.getElementById("logout-btn");
const currentUserEl = document.getElementById("current-user");
const desktopDiscovery = document.getElementById("desktop-discovery");
const hostUrlsList = document.getElementById("host-urls");
const discoveredHostsList = document.getElementById("discovered-hosts");
const hostNetworkPanel = document.getElementById("host-network-panel");
const clientNetworkPanel = document.getElementById("client-network-panel");
const startHostBtn = document.getElementById("start-host-btn");
const stopHostBtn = document.getElementById("stop-host-btn");
const manageUsersBtn = document.getElementById("manage-users-btn");
const discoverBtn = document.getElementById("discover-btn");
const userManagerModal = document.getElementById("user-manager-modal");
const closeUserModalBtn = document.getElementById("close-user-modal");
const userForm = document.getElementById("user-form");
const allowedUserList = document.getElementById("allowed-user-list");
const newUserNameInput = document.getElementById("new-user-name");
const newUserPasswordInput = document.getElementById("new-user-password");
const modeButtons = Array.from(document.querySelectorAll(".mode-btn"));

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

function setDesktopDiscoveryVisible() {
  if (!isElectron) {
    desktopDiscovery.classList.add("hidden");
    return;
  }

  desktopDiscovery.classList.remove("hidden");
  hostNetworkPanel.classList.toggle("hidden", state.desktopMode !== "host");
  clientNetworkPanel.classList.toggle("hidden", state.desktopMode !== "client");
  manageUsersBtn.classList.toggle("hidden", state.desktopMode !== "host");

  modeButtons.forEach((button) => {
    const isActive = button.dataset.mode === state.desktopMode;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });
}

function setDesktopMode(mode) {
  state.desktopMode = mode;
  setDesktopDiscoveryVisible();

  if (!isElectron) {
    return;
  }

  if (mode === "host") {
    refreshNetworkInfo();
  }

  if (mode === "client") {
    discoverLocalHosts();
  }
}

function setHostUrls(hostnames) {
  hostUrlsList.innerHTML = "";

  if (!hostnames?.length) {
    const item = document.createElement("li");
    item.textContent = "No hostnames available yet.";
    hostUrlsList.appendChild(item);
    return;
  }

  for (const url of hostnames) {
    const item = document.createElement("li");
    const link = document.createElement("button");
    link.type = "button";
    link.className = "link-btn";
    link.textContent = url;
    link.addEventListener("click", async () => {
      await window.localShareApi.openExternalUrl(url);
    });
    item.appendChild(link);
    hostUrlsList.appendChild(item);
  }
}

function setDiscoveredHosts(hosts) {
  discoveredHostsList.innerHTML = "";

  if (!hosts?.length) {
    const item = document.createElement("li");
    item.textContent = "No hosts found yet.";
    discoveredHostsList.appendChild(item);
    return;
  }

  for (const host of hosts) {
    const item = document.createElement("li");
    const label = document.createElement("div");
    label.textContent = host.name || host.host || "Local Share";
    const url = document.createElement("button");
    url.type = "button";
    url.className = "link-btn";
    url.textContent = host.url || `http://${host.host}:${host.port}`;
    url.addEventListener("click", async () => {
      const target = host.url || `http://${host.host}:${host.port}`;
      await window.localShareApi.openExternalUrl(target);
    });

    item.appendChild(label);
    item.appendChild(url);
    discoveredHostsList.appendChild(item);
  }
}

async function refreshNetworkInfo() {
  if (!isElectron) {
    return;
  }

  try {
    const info = await window.localShareApi.getNetworkInfo();
    setHostUrls(info.hostnames || []);
  } catch (error) {
    showToast(error.message || "Could not refresh host info", "err");
  }
}

async function startHostBroadcast() {
  if (!isElectron) {
    return;
  }

  try {
    const info = await window.localShareApi.startHostBroadcast();
    setHostUrls(info.urls || []);
    showToast(`Hosting on ${info.hostname}`, "ok");
  } catch (error) {
    showToast(error.message || "Could not start hosting", "err");
  }
}

async function stopHostBroadcast() {
  if (!isElectron) {
    return;
  }

  try {
    await window.localShareApi.stopHostBroadcast();
    setHostUrls([]);
    showToast("Broadcast stopped", "ok");
  } catch (error) {
    showToast(error.message || "Could not stop hosting", "err");
  }
}

async function discoverLocalHosts() {
  if (!isElectron) {
    return;
  }

  try {
    const hosts = await window.localShareApi.discoverHosts();
    setDiscoveredHosts(hosts);
  } catch (error) {
    showToast(error.message || "Could not discover hosts", "err");
  }
}

function renderAllowedUsers(users) {
  allowedUserList.innerHTML = "";

  if (!users?.length) {
    const item = document.createElement("li");
    item.textContent = "No users configured yet.";
    allowedUserList.appendChild(item);
    return;
  }

  for (const username of users) {
    const item = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = username;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "small-btn remove-user-btn";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", async () => {
      try {
        const refreshed = await window.localShareApi.removeAllowedUser(username);
        renderAllowedUsers(refreshed);
        showToast(`Removed ${username}`, "ok");
      } catch (error) {
        showToast(error.message || "Failed to remove user", "err");
      }
    });

    item.appendChild(label);
    item.appendChild(removeBtn);
    allowedUserList.appendChild(item);
  }
}

async function openUserManager() {
  if (!isElectron || !window.localShareApi || typeof window.localShareApi.listAllowedUsers !== "function") {
    showToast("User management is only available in the Electron host app.", "err");
    return;
  }

  try {
    const users = await window.localShareApi.listAllowedUsers();
    renderAllowedUsers(users);
    userManagerModal.classList.remove("hidden");
    userManagerModal.setAttribute("aria-hidden", "false");
  } catch (error) {
    showToast(error.message || "Could not load users", "err");
  }
}

function closeUserManager() {
  userManagerModal.classList.add("hidden");
  userManagerModal.setAttribute("aria-hidden", "true");
  userForm.reset();
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

modeButtons.forEach((button) => {
  button.addEventListener("click", () => setDesktopMode(button.dataset.mode));
});

manageUsersBtn.addEventListener("click", () => {
  openUserManager();
});

startHostBtn.addEventListener("click", () => {
  startHostBroadcast();
});

closeUserModalBtn.addEventListener("click", () => {
  closeUserManager();
});

userManagerModal.addEventListener("click", (event) => {
  if (event.target === userManagerModal) {
    closeUserManager();
  }
});

userForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = String(newUserNameInput.value || "").trim();
  const password = String(newUserPasswordInput.value || "");

  if (!username || !password) {
    showToast("Username and password are required", "err");
    return;
  }

  try {
    const users = await window.localShareApi.createAllowedUser(username, password);
    renderAllowedUsers(users);
    userForm.reset();
    showToast(`Created ${username}`, "ok");
  } catch (error) {
    showToast(error.message || "Could not create user", "err");
  }
});

stopHostBtn.addEventListener("click", () => {
  stopHostBroadcast();
});

discoverBtn.addEventListener("click", () => {
  discoverLocalHosts();
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
setDesktopDiscoveryVisible();
setActiveTab("files");

if (isElectron) {
  setDesktopMode("host");
}

if (state.token && state.username) {
  loadTexts().catch(() => {
    logout();
  });
}
