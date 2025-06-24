// src/contexts/WalletContext.tsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

// Определяем тип Wallet, который вы уже используете
export type Wallet = {
    id: string;
    name: string;
    address: string;
    balance: string;
    withdrawal: 0 | 1;
}

// Определяем тип контекста
interface WalletContextType {
    wallets: Wallet[];
    isLoadingWallets: boolean;
    errorLoadingWallets: string | null;
    refetchWallets: () => Promise<void>; // Функция для ручного обновления
}

// Создаем контекст
const WalletContext = createContext<WalletContextType | undefined>(undefined);

// Создаем компонент-провайдер
export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [wallets, setWallets] = useState<Wallet[]>([]);
    const [isLoadingWallets, setIsLoadingWallets] = useState(true);
    const [errorLoadingWallets, setErrorLoadingWallets] = useState<string | null>(null);
// Функция для получения кошельков, обернутая в useCallback
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
                setWallets([]); // Гарантируем пустой массив при ошибке API
            }
        } catch (error: any) {
            console.error("WalletProvider: Error fetching wallets:", error);
            setErrorLoadingWallets(`Failed to load wallets: ${error.message || String(error)}`);
            setWallets([]); // Гарантируем пустой массив при ошибке загрузки
        } finally {
            setIsLoadingWallets(false);
            console.log("WalletProvider: Wallet fetch finished.");
        }

    }, []); // Пустой массив зависимостей, т.к. fetchWalllets не зависит от изменяемых переменных


// useEffect для начальной загрузки и подписки на обновления
    useEffect(() => {
        console.log("WalletProvider: Initial fetch and subscription setup.");
        fetchWallets(); // Загружаем кошельки при первом монтировании провайдера

        let unsubscribeFromWalletsUpdated: (() => void) | undefined;
        if (window.electronAPI && window.electronAPI.onWalletsUpdated) {
            console.log("WalletProvider: Subscribing to 'wallets-updated' channel.");
            unsubscribeFromWalletsUpdated = window.electronAPI.onWalletsUpdated((updatedWallets) => {
                console.log("WalletProvider: Received 'wallets-updated' event from main process:", updatedWallets);
                setWallets(updatedWallets); // Обновляем состояние при получении обновления
                setIsLoadingWallets(false);
                setErrorLoadingWallets(null);
            });
        } else {
            console.warn("WalletProvider: Electron API method onWalletsUpdated not available. Live wallet updates will not work.");
        }

        // Функция очистки (вызывается при размонтировании WalletProvider)
        return () => {
            console.log("WalletProvider: Component unmounting. Running cleanup function...");
            if (unsubscribeFromWalletsUpdated) {
                console.log("WalletProvider: Unsubscribing from 'wallets-updated' channel.");
                unsubscribeFromWalletsUpdated();
            }
            console.log("WalletProvider: Cleanup finished.");
        };
    }, [fetchWallets]); // Зависимость от fetchWallets, которая мемоизирована useCallback

// Значение, которое будет предоставлено всем потребителям контекста
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

// Хук для удобного использования контекста в компонентах
export const useWallets = (filterValue?: 0 | 1) => {
    const context = useContext(WalletContext);
    if (context === undefined) {
        throw new Error('useWallets must be used within a WalletProvider');
    }

// Применяем фильтрацию здесь
    const filteredWallets = React.useMemo(() => {
        if (filterValue === undefined) {
            return context.wallets; // Если фильтр не указан, возвращаем все
        }
        return context.wallets.filter(wallet => wallet.withdrawal === filterValue);
    }, [context.wallets, filterValue]); // Пересчитываем только при изменении wallets или filterValue

    return {
        wallets: filteredWallets,
        isLoadingWallets: context.isLoadingWallets,
        errorLoadingWallets: context.errorLoadingWallets,
        refetchWallets: context.refetchWallets,
    };
    };

