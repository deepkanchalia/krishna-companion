const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("krishna", {
  dismiss: () => ipcRenderer.send("companion:dismiss"),
  engage: () => ipcRenderer.send("companion:engage"),
  openSource: (url) => ipcRenderer.send("companion:open-source", url),
  resize: (height) => ipcRenderer.send("companion:resize", height),
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
