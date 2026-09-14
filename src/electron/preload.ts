import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("localShareApi", {
  getNetworkInfo: () => ipcRenderer.invoke("get-network-info"),
  startHostBroadcast: () => ipcRenderer.invoke("start-host-broadcast"),
  stopHostBroadcast: () => ipcRenderer.invoke("stop-host-broadcast"),
  discoverHosts: () => ipcRenderer.invoke("discover-hosts"),
  openExternalUrl: (url: string) => ipcRenderer.invoke("open-external-url", url),
});
