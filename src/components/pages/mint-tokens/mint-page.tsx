"use client";

import { useState, useEffect, useCallback } from "react";
import { v4 as uuidv4 } from 'uuid';
import { Wallet } from "@/components/provider/wallet-provider.tsx";
import { CurrentMints } from "./current-mints.tsx";
import {MintForm} from "@/components/pages/mint-tokens/mint-form.tsx";

export interface MintProcess {
    id: string;
    wallet: Wallet;
    ticker: string;
    targetMints: number;
    currentMints: number;
    fee: string;
    status: 'starting' | 'active' | 'stopping' | 'finished' | 'error' | 'stopped' | 'confirming';
    error?: string;
    tokenInfo?: any;
    lastTxid?: string;
}

export function MintPage() {
    const [activeProcesses, setActiveProcesses] = useState<Record<string, MintProcess>>({});

    useEffect(() => {
        const unsubscribe = window.electronAPI.onMintProgress(update => {
            setActiveProcesses(prev => {
                const existingProcess = prev[update.processId];
                if (!existingProcess) return prev;
                if (update.status === 'stopped' || update.status === 'finished' || update.status === 'error') {
                    setTimeout(() => {
                        setActiveProcesses(p => {
                            const { [update.processId]: _, ...rest } = p;
                            return rest;
                        });
                    }, 5000);
                }

                return {
                    ...prev,
                    [update.processId]: {
                        ...existingProcess,
                        currentMints: update.currentIndex,
                        status: update.status,
                        error: update.error,
                        lastTxid: update.txid,
                    }
                };
            });
        });
        return () => unsubscribe();
    }, []);

    const refreshProcessTokenInfo = useCallback(async (processId: string, ticker: string) => {
        try {
            const result = await window.electronAPI.getTokenInfo(ticker);
            if (result.success) {
                setActiveProcesses(prevProcesses => {
                    if (!prevProcesses[processId]) {
                        return prevProcesses;
                    }
                    return {
                        ...prevProcesses,
                        [processId]: {
                            ...prevProcesses[processId],
                            tokenInfo: result.data
                        }
                    };
                });
            }
        } catch (e) {
            console.error("Failed to refresh token info", e);
        }
    }, []);

    useEffect(() => {
        const processesToTrack = Object.values(activeProcesses)
            .filter(p => p.status === 'active' || p.status === 'confirming')
            .map(p => ({ id: p.id, ticker: p.ticker }));

        if (processesToTrack.length === 0) {
            return;
        }

        const timerId = setTimeout(() => {
            processesToTrack.forEach(p => {
                refreshProcessTokenInfo(p.id, p.ticker);
            });
        }, 5000);

        return () => clearTimeout(timerId);

    }, [activeProcesses, refreshProcessTokenInfo]);

    const handleStartMint = useCallback(async (params: { wallets: Wallet[]; ticker: string; amount: number; fee: string; }) => {
        const { wallets, ticker, amount, fee } = params;
        const lowerCaseTicker = ticker.toLowerCase();

        const initialInfoResult = await window.electronAPI.getTokenInfo(lowerCaseTicker);
        if (!initialInfoResult.success || !initialInfoResult.data) {
            throw new Error(initialInfoResult.error || `Token "${ticker}" not found.`);
        }

        const startPromises = wallets.map(async (wallet) => {
            const processId = uuidv4();

            const newProcess: MintProcess = {
                id: processId,
                wallet,
                ticker: lowerCaseTicker,
                targetMints: amount,
                currentMints: 0,
                fee: fee,
                tokenInfo: initialInfoResult.success ? initialInfoResult.data : null,
                status: 'starting',
            };

            setActiveProcesses(prev => ({ ...prev, [processId]: newProcess }));

            try {
                const startResult = await window.electronAPI.startMint({
                    processId,
                    walletAddress: wallet.address,
                    ticker: lowerCaseTicker,
                    mintTimes: amount,
                    fee,
                });

                if (!startResult.success) {
                    setActiveProcesses(prev => ({
                        ...prev,
                        [processId]: { ...prev[processId], status: 'error', error: startResult.error || "Failed to start" }
                    }));
                }
            } catch (e: any) {
                setActiveProcesses(prev => ({
                    ...prev,
                    [processId]: { ...prev[processId], status: 'error', error: e.message }
                }));
            }
        });

        await Promise.all(startPromises);

    }, []);

    const handleStopMint = useCallback(async (processId: string) => {
        const processToStop = activeProcesses[processId];
        if (!processToStop) {
            console.warn(`Attempted to stop a non-existent process with ID: ${processId}`);
            return;
        }

        setActiveProcesses(prev => ({
            ...prev,
            [processId]: { ...prev[processId], status: 'stopping' }
        }));

        try {
            const result = await window.electronAPI.stopMint(processId);
            if (!result.success) {
                console.error(`Failed to send stop command for process ${processId}:`, result.error);
                setActiveProcesses(prev => ({
                    ...prev,
                    [processId]: { ...prev[processId], status: 'error', error: `Failed to stop: ${result.error}` }
                }));
            }
        } catch (e: any) {
            console.error(`Error calling stopMint IPC for process ${processId}:`, e);
            setActiveProcesses(prev => ({
                ...prev,
                [processId]: { ...prev[processId], status: 'error', error: `IPC Error: ${e.message}` }
            }));
        }
    }, [activeProcesses]);
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <MintForm onStartMint={handleStartMint} />
            <CurrentMints
                processes={Object.values(activeProcesses)}
                onStop={handleStopMint}
            />
        </div>
    );
}