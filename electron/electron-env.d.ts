import {IpcRendererEvent} from 'electron';
import {Wallet} from './src/components/provider/wallet-provider';

export interface MintProgressUpdate {
    processId: string;
    currentIndex: number;
    total: number;
    txid: string;
    status: 'active' | 'finished' | 'error' | 'stopped' | 'confirming';
    error?: string;
}

export interface DashboardStats {
    daaScore?: number;
    circulatingSupply?: string;
    maxSupply?: string;
    hashrate?: number;
    nextHalvingTimestamp?: number;
    nextHalvingDate?: string;
    nextReward?: number;
    price?: number;
    priceChange24h?: number;
    volume24h?: number;
    marketCap?: number;
    rank?: number;
}

declare global {
    interface Window {
        electronAPI: {
            setNetwork: (network: string) => Promise<any>;
            getInitialNetwork: () => Promise<any>;
            setupPassword: (password: string) => Promise<{ success: boolean; error?: string }>;
            login: (password: string) => Promise<{ success: boolean; error?: string }>;
            getWallets: () => Promise<Wallet[]>;
            getPrivateKeys: (addresses: string[]) => Promise<[string, string][]>; // Map превращается в массив пар [key, value] при передаче через IPC
            createWallet: (name?: string) => Promise<{
                success: boolean;
                error?: string;
                newWalletId?: string,
                newWalletAddress?: string
            }>;
            importWallet: (key: string, name: string) => Promise<{
                success: boolean;
                error?: string;
                newWalletId?: string,
                newWalletAddress?: string
            }>;
            deleteWallet: (address: string) => Promise<{ success: boolean, message?: string }>;
            addWallet: (key: string, name: string) => Promise<{
                success: boolean;
                error?: string;
                newWalletId?: string,
                newWalletAddress?: string
            }>;
            renameWallet: (address: string, newName: string) => Promise<{ success: boolean; error?: string }>;
            getTokensForAddresses: (addresses: string[]) => Promise<{ [address: string]: any[] }>;
            sendFunds: (senderAddresses: string[], recipientDetails: Array<{
                address: string;
                amount: string;
            }>, transactionType: string, ticker: string, fee: string) => Promise<{
                success: boolean;
                error?: string;
                txid?: string;
                txids?: string[]
            }>;
            deploy: (action: 'deploy' | 'checkTicker', payload: any) => Promise<{
                success: boolean;
                error?: string;
                txid?: string,
                available?: boolean
            }>;
            getTokenInfo: (ticker: string) => Promise<{ success: boolean; error?: string; data?: any }>;
            startMint: (params: {
                processId: string;
                walletAddress: string;
                ticker: string;
                mintTimes: number;
                fee: string;
            }) => Promise<{ success: boolean; error?: string }>;
            stopMint: (processId: string) => Promise<{ success: boolean; error?: string }>;
            getCurrentNetwork: () => Promise<{ success: boolean; network?: string; error?: string }>;
            getTokenMarketInfo: (ticker: string) => Promise<{ success: boolean; data?: any, error?: string }>;
            getDashboardStats: () => Promise<{ success: boolean; data?: Partial<DashboardStats>, error?: string }>;

            onMintProgress: (callback: (update: MintProgressUpdate) => void) => () => void;
            onAppStateUpdate: (callback: (state: 'create-password' | 'login' | 'dashboard') => void) => () => void;
            onWalletsUpdated: (callback: (wallets: Wallet[]) => void) => () => void;
        };
        ipcRenderer: {
            on: (channel: string, listener: (event: IpcRendererEvent, ...args: any[]) => void) => Electron.IpcRenderer;
            off: (channel: string, listener: (...args: any[]) => void) => Electron.IpcRenderer;
            send: (channel: string, ...args: any[]) => void;
            invoke: (channel: string, ...args: any[]) => Promise<any>;
        };
    }
}

export {};