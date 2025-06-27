import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';


export type Wallet = {
    id: string;
    name: string;
    address: string;
    balance: string;
    withdrawal: 0 | 1;
}

interface WalletContextType {
    wallets: Wallet[];
    isLoadingWallets: boolean;
    errorLoadingWallets: string | null;
    refetchWallets: () => Promise<void>
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [wallets, setWallets] = useState<Wallet[]>([]);
    const [isLoadingWallets, setIsLoadingWallets] = useState(true);
    const [errorLoadingWallets, setErrorLoadingWallets] = useState<string | null>(null);
    const fetchWallets = useCallback(async () => {
        console.log("WalletProvider: Performing wallet fetch...");
        setErrorLoadingWallets(null);
        setIsLoadingWallets(true);

        try {
            if (window.electronAPI && window.electronAPI.getWallets) {
                const fetchedWallets = await window.electronAPI.getWallets();
                console.log("WalletProvider: Received wallets from Main:", fetchedWallets);
                setWallets(Array.isArray(fetchedWallets) ? fetchedWallets : []);
            }
            else{
                console.error("WalletProvider: Electron API for getWallets not available.");
                setErrorLoadingWallets("Application error: Cannot load wallets (API not available).");
                setWallets([]);
            }
        } catch (error: any) {
            console.error("WalletProvider: Error fetching wallets:", error);
            setErrorLoadingWallets(`Failed to load wallets: ${error.message || String(error)}`);
            setWallets([]);
        } finally {
            setIsLoadingWallets(false);
            console.log("WalletProvider: Wallet fetch finished.");
        }

    }, []);


    useEffect(() => {
        console.log("WalletProvider: Initial fetch and subscription setup.");
        fetchWallets();

        let unsubscribeFromWalletsUpdated: (() => void) | undefined;
        if (window.electronAPI && window.electronAPI.onWalletsUpdated) {
            console.log("WalletProvider: Subscribing to 'wallets-updated' channel.");
            unsubscribeFromWalletsUpdated = window.electronAPI.onWalletsUpdated((updatedWallets) => {
                console.log("WalletProvider: Received 'wallets-updated' event from main process:", updatedWallets);
                setWallets(updatedWallets);
                setIsLoadingWallets(false);
                setErrorLoadingWallets(null);
            });
        } else {
            console.warn("WalletProvider: Electron API method onWalletsUpdated not available. Live wallet updates will not work.");
        }

        return () => {
            console.log("WalletProvider: Component unmounting. Running cleanup function...");
            if (unsubscribeFromWalletsUpdated) {
                console.log("WalletProvider: Unsubscribing from 'wallets-updated' channel.");
                unsubscribeFromWalletsUpdated();
            }
            console.log("WalletProvider: Cleanup finished.");
        };
    }, [fetchWallets]);

    const contextValue: WalletContextType = {
        wallets,
        isLoadingWallets,
        errorLoadingWallets,
        refetchWallets: fetchWallets,
    };

    return (
        <WalletContext.Provider value={contextValue}>
            {children}
        </WalletContext.Provider>
    );
};


export const useWallets = (filterValue?: 0 | 1) => {
    const context = useContext(WalletContext);
    if (context === undefined) {
        throw new Error('useWallets must be used within a WalletProvider');
    }


    const filteredWallets = React.useMemo(() => {
        if (filterValue === undefined) {
            return context.wallets;
        }
        return context.wallets.filter(wallet => wallet.withdrawal === filterValue);
    }, [context.wallets, filterValue]);

    return {
        wallets: filteredWallets,
        isLoadingWallets: context.isLoadingWallets,
        errorLoadingWallets: context.errorLoadingWallets,
        refetchWallets: context.refetchWallets,
    };
    };

