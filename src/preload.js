const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("krishna", {
  dismiss: () => ipcRenderer.send("companion:dismiss"),
  openSource: (url) => ipcRenderer.send("companion:open-source", url),
  onShow: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("companion:show", listener);
    return () => ipcRenderer.removeListener("companion:show", listener);
  },
  onCollapse: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("companion:collapse", listener);
    return () => ipcRenderer.removeListener("companion:collapse", listener);
  }
});
