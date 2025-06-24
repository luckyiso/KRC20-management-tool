import { ipcRenderer, contextBridge } from 'electron'
import {KaspaWalletToken} from "@/api/BalanceChecker/krc20-balance.ts";

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },

  // You can expose other APTs you need here.
  // ...

})

export type Wallet = {
  id: string;
  name: string;
  address: string;
  balance: string;
}


contextBridge.exposeInMainWorld('electronAPI', {

  setNetwork: (network: string) => ipcRenderer.invoke('set-network', network),
  getInitialNetwork: () => ipcRenderer.invoke('get-initial-network'),
  setupPassword: (password: string) => ipcRenderer.invoke('create-password', password),
  login: (password: string) => ipcRenderer.invoke('login', password),
  getWallets: () => ipcRenderer.invoke('get-wallets'),
  getPrivateKeys: (addresses: string[]): Promise<Map<string, string>> => ipcRenderer.invoke('get-private-keys', addresses),
  createWallet: (name?: string) => ipcRenderer.invoke('create-wallet', name),
  importWallet: (key: string, name: string) => ipcRenderer.invoke('import-wallet', key, name),
  deleteWallet: (address: string) => ipcRenderer.invoke('delete-wallet', address),
  addWallet: (key: string, name: string) => ipcRenderer.invoke('add-wallet', key, name),
  renameWallet: (address: string, newName: string) => ipcRenderer.invoke('rename-wallet', address, newName),
  getTokensForAddresses: (addresses: string[]): Promise<{ [address: string]: KaspaWalletToken[] }> => ipcRenderer.invoke('get-tokens-for-addresses', addresses),
  sendFunds: (
      senderAddresses: string[],
      recipientDetails: Array<{ address: string; amount: string; }>,
      transactionType: 'singleToSingle' | 'singleToMultiple' | 'multipleToSingle',
      ticker: string,
      fee: string
  ) => ipcRenderer.invoke('send-funds', senderAddresses, recipientDetails, transactionType, ticker, fee),
  deploy: (action: string, payload: any) => ipcRenderer.invoke('deploy', { action, payload }),
  getTokenInfo: (ticker: string) => ipcRenderer.invoke('get-token-info', ticker),
  startMint: (params: { processId: string; walletAddress: string; ticker: string; mintTimes: number; fee: string; }) => ipcRenderer.invoke('start-mint', params),
  stopMint: (processId: string) => ipcRenderer.invoke('stop-mint', processId),
  getCurrentNetwork: () => ipcRenderer.invoke('get-current-network'),
  getTokenMarketInfo: (ticker: string) => ipcRenderer.invoke('get-token-market-info', ticker),

  onMintProgress: (callback: (update: any) => void) => {
    const handler = (event, update) => callback(update);
    ipcRenderer.on('mint-progress-update', handler);
    // Возвращаем функцию для отписки, чтобы избежать утечек памяти
    return () => {
      ipcRenderer.removeListener('mint-progress-update', handler);
    };
  },
  onAppStateUpdate: (callback: (state: 'create-password' | 'login' | 'dashboard') => void) => {
    ipcRenderer.on('app-state-update', (event, state) => callback(state));
    // Возвращаем функцию для очистки слушателя
    return () => { ipcRenderer.off('app-state-update', callback); };
  },
  onWalletsUpdated: (callback: (wallets: Wallet[]) => void) => {
    const subscription = (event, wallets: Wallet[]) => callback(wallets);
    // Подписываемся на новый канал
    ipcRenderer.on('wallets-updated', subscription);
    // Возвращаем функцию для отписки
    return () => {
      console.log("Unsubscribing from wallets-updated");
      ipcRenderer.off('wallets-updated', subscription);
    };
  },
})