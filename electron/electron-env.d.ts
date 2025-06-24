/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * The built directory structure
     *
     * ```tree
     * ├─┬─┬ dist
     * │ │ └── index.html
     * │ │
     * │ ├─┬ dist-electron
     * │ │ ├── main.js
     * │ │ └── preload.js
     * │
     * ```
     */
    APP_ROOT: string
    /** /dist/ or /public/ */
    VITE_PUBLIC: string
  }
}

export type Wallet = {
  id: string;
  name: string;
  address: string;
  balance: string;
}

export interface MarketTokenInfo {
  rank: number;
  ticker: string;
  price: {
    priceInUsd: number;
    change24h: number; // <-- ПРАВИЛЬНОЕ ИМЯ ПОЛЯ
    marketCapInUsd: number;
  };
  tradeVolume: {
    amountInUsd: number;
  };
}

export interface KaspacomApiResponse {
  ticker: string;
  price: number;
  marketCap: number;
  volumeUsd: number;
  change24h?: number;
}


// Used in Renderer process, expose in `preload.ts`
declare global {
  interface Window {
    ipcRenderer: import('electron').IpcRenderer
    electronAPI?: {
      setNetwork: (network: string) => void;
      getInitialNetwork: () => Promise<string>;
      getCurrentNetwork: () => Promise<{ success: boolean; network?: 'Mainnet' | 'Testnet'; error?: string; }>;

      setupPassword: (password: string) => Promise<{ success: boolean }>;
      login: (password: string) => Promise <{success: boolean}>;

      getWallets: () => Promise<Wallet[]>;
      getPrivateKeys: (addresses: string[]) => Promise<Map<string, string>>;
      createWallet: (name?: string) => Promise<Wallet[]>;
      importWallet: (key: string, name: string) => Promise<{ success: boolean; newWalletId?: string; newWalletAddress?: string; error?: string }>;
      deleteWallet: (address: string) => Promise<{ success: boolean; message?: string }>; // Modified: For single wallet deletion
      addWallet: (key: string, name: string) => Promise<{ success: boolean; newWalletId?: string; newWalletAddress?: string; error?: string }>;
      renameWallet: (address: string, newName: string) => Promise<{ success: boolean; message?: string }>; // Обновлён тип name на newName
      getTokensForAddresses: (addresses: string[]) => Promise<{ [address: string]: KaspaWalletToken[] }>;
      sendFunds: (
          senderAddresses: string[],
          recipientDetails: Array<{ address: string; amount: string; }>, // Изменено
          transactionType: 'singleToSingle' | 'singleToMultiple' | 'multipleToSingle', // Добавлено
          ticker: string,
          fee: string
      ) => Promise <{success: boolean; txid?: string; error?: string;}>;
      startMint: (params: {
        processId: string;
        walletAddress: string;
        ticker: string;
        mintTimes: number;
        fee: string; // Комиссия в KAS, как строка
      }) => Promise<{ success: boolean; error?: string; }>;
      stopMint: (processId: string) => Promise<{ success: boolean; error?: string; }>;
      onMintProgress: (callback: (update: {
        processId: string;
        currentIndex: number;
        total: number;
        txid: string;
        status: 'active' | 'finished' | 'error' | 'stopped';
        error?: string;
      }) => void) => () => void;
      getTokenInfo: (ticker: string) => Promise<{ success: boolean; data?: any; error?: string; }>;
      onAppStateUpdate: (callback: (state: 'loading' | 'create-password' | 'login' | 'dashboard') => void) => () => void;
      onWalletsUpdated: (callback: (wallets: Wallet[]) => void) => () => void;
      deploy: (action: 'deploy' | 'checkTicker', payload: any) => Promise<any>;
      getTokenMarketInfo: (ticker: string) => Promise<{ success: boolean; data?: KaspacomApiResponse; error?: string; }>;
    }
  }
}
