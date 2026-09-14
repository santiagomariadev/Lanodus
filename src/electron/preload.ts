import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("localShareApi", {
  getNetworkInfo: () => ipcRenderer.invoke("get-network-info"),
  startHostBroadcast: () => ipcRenderer.invoke("start-host-broadcast"),
  stopHostBroadcast: () => ipcRenderer.invoke("stop-host-broadcast"),
  discoverHosts: () => ipcRenderer.invoke("discover-hosts"),
  listAllowedUsers: () => ipcRenderer.invoke("list-allowed-users"),
  createAllowedUser: (username: string, password: string) =>
    ipcRenderer.invoke("create-allowed-user", username, password),
  removeAllowedUser: (username: string) => ipcRenderer.invoke("remove-allowed-user", username),
  openExternalUrl: (url: string) => ipcRenderer.invoke("open-external-url", url),
});
