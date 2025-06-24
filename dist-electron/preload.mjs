"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("ipcRenderer", {
  on(...args) {
    const [channel, listener] = args;
    return electron.ipcRenderer.on(channel, (event, ...args2) => listener(event, ...args2));
  },
  off(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.off(channel, ...omit);
  },
  send(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.send(channel, ...omit);
  },
  invoke(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.invoke(channel, ...omit);
  }
  // You can expose other APTs you need here.
  // ...
});
electron.contextBridge.exposeInMainWorld("electronAPI", {
  setNetwork: (network) => electron.ipcRenderer.invoke("set-network", network),
  getInitialNetwork: () => electron.ipcRenderer.invoke("get-initial-network"),
  setupPassword: (password) => electron.ipcRenderer.invoke("create-password", password),
  login: (password) => electron.ipcRenderer.invoke("login", password),
  getWallets: () => electron.ipcRenderer.invoke("get-wallets"),
  getPrivateKeys: (addresses) => electron.ipcRenderer.invoke("get-private-keys", addresses),
  createWallet: (name) => electron.ipcRenderer.invoke("create-wallet", name),
  importWallet: (key, name) => electron.ipcRenderer.invoke("import-wallet", key, name),
  deleteWallet: (address) => electron.ipcRenderer.invoke("delete-wallet", address),
  addWallet: (key, name) => electron.ipcRenderer.invoke("add-wallet", key, name),
  renameWallet: (address, newName) => electron.ipcRenderer.invoke("rename-wallet", address, newName),
  getTokensForAddresses: (addresses) => electron.ipcRenderer.invoke("get-tokens-for-addresses", addresses),
  sendFunds: (senderAddresses, recipientDetails, transactionType, ticker, fee) => electron.ipcRenderer.invoke("send-funds", senderAddresses, recipientDetails, transactionType, ticker, fee),
  deploy: (action, payload) => electron.ipcRenderer.invoke("deploy", { action, payload }),
  getTokenInfo: (ticker) => electron.ipcRenderer.invoke("get-token-info", ticker),
  startMint: (params) => electron.ipcRenderer.invoke("start-mint", params),
  stopMint: (processId) => electron.ipcRenderer.invoke("stop-mint", processId),
  getCurrentNetwork: () => electron.ipcRenderer.invoke("get-current-network"),
  getTokenMarketInfo: (ticker) => electron.ipcRenderer.invoke("get-token-market-info", ticker),
  onMintProgress: (callback) => {
    const handler = (event, update) => callback(update);
    electron.ipcRenderer.on("mint-progress-update", handler);
    return () => {
      electron.ipcRenderer.removeListener("mint-progress-update", handler);
    };
  },
  onAppStateUpdate: (callback) => {
    electron.ipcRenderer.on("app-state-update", (event, state) => callback(state));
    return () => {
      electron.ipcRenderer.off("app-state-update", callback);
    };
  },
  onWalletsUpdated: (callback) => {
    const subscription = (event, wallets) => callback(wallets);
    electron.ipcRenderer.on("wallets-updated", subscription);
    return () => {
      console.log("Unsubscribing from wallets-updated");
      electron.ipcRenderer.off("wallets-updated", subscription);
    };
  }
});
