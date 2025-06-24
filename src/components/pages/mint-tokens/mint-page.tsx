"use client";

import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import { v4 as uuidv4 } from 'uuid';
import { Wallet } from "@/components/provider/wallet-provider.tsx";
import { CurrentMints } from "./current-mints.tsx";
import {MintForm} from "@/components/pages/mint-tokens/mint-form.tsx";

// Тип для хранения информации о процессе минта
export interface MintProcess {
    id: string;
    wallet: Wallet;
    ticker: string;
    targetMints: number;  // <--- ПРАВИЛЬНОЕ ПОЛЕ
    currentMints: number; // <--- ПРАВИЛЬНОЕ ПОЛЕ
    fee: string;
    status: 'starting' | 'active' | 'stopping' | 'finished' | 'error' | 'stopped' | 'confirming';
    error?: string;
    tokenInfo?: any;
    lastTxid?: string;
}

export function MintPage() {
    // Состояние всех активных процессов живет здесь, в родительском компоненте
    const [activeProcesses, setActiveProcesses] = useState<Record<string, MintProcess>>({});

    // --- ВСЯ ЛОГИКА УПРАВЛЕНИЯ ПЕРЕНЕСЕНА СЮДА ---

    // Подписка на обновления с бэкенда
    useEffect(() => {
        const unsubscribe = window.electronAPI.onMintProgress(update => {
            setActiveProcesses(prev => {
                const existingProcess = prev[update.processId];
                if (!existingProcess) return prev;

                if (update.status === 'stopped' || update.status === 'finished' || update.status === 'error') {
                    // Можно добавить задержку перед удалением, чтобы пользователь увидел финальный статус
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

    // Функция для обновления информации о токене (остаток и т.д.)
    const refreshProcessTokenInfo = useCallback(async (processId: string, ticker: string) => {
        try {
            const result = await window.electronAPI.getTokenInfo(ticker);
            if (result.success) {
                // Используем функциональную форму setState. `prev` всегда будет актуальным.
                setActiveProcesses(prevProcesses => {
                    // Проверяем, существует ли процесс в АКТУАЛЬНОМ состоянии
                    if (!prevProcesses[processId]) {
                        return prevProcesses; // Ничего не меняем, если процесс уже удален
                    }
                    // Возвращаем новое состояние
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

    // Периодическое обновление данных
    useEffect(() => {
        // Получаем список ID процессов, которые нужно отслеживать
        const processesToTrack = Object.values(activeProcesses)
            .filter(p => p.status === 'active' || p.status === 'confirming')
            .map(p => ({ id: p.id, ticker: p.ticker }));

        // Если нет процессов для отслеживания, ничего не делаем
        if (processesToTrack.length === 0) {
            return;
        }

        // Запускаем таймер
        const timerId = setTimeout(() => {
            // Когда таймер сработает, запускаем обновление для всех отслеживаемых процессов
            processesToTrack.forEach(p => {
                refreshProcessTokenInfo(p.id, p.ticker);
            });
        }, 5000); // Задержка в 5 секунд

        // Функция очистки, которая сработает при изменении activeProcesses или размонтировании
        return () => clearTimeout(timerId);

    }, [activeProcesses, refreshProcessTokenInfo]);

    // Обработчик для ЗАПУСКА минта (вызывается из MintForm)
    const handleStartMint = useCallback(async (params: { wallets: Wallet[]; ticker: string; amount: number; fee: string; }) => {
        const { wallets, ticker, amount, fee } = params;
        const lowerCaseTicker = ticker.toLowerCase();

        const initialInfoResult = await window.electronAPI.getTokenInfo(lowerCaseTicker);
        if (!initialInfoResult.success || !initialInfoResult.data) {
            // Бросаем ошибку, которая будет поймана в MintForm и отображена пользователю
            throw new Error(initialInfoResult.error || `Token "${ticker}" not found.`);
        }

        // Создаем массив промисов для всех запускаемых процессов
        const startPromises = wallets.map(async (wallet) => {
            const processId = uuidv4();

            const newProcess: MintProcess = {
                id: processId,
                wallet,
                ticker: lowerCaseTicker,
                targetMints: amount,      // Используем targetMints
                currentMints: 0,          // Начинаем с 0
                fee: fee,                 // Добавляем недостающее поле fee
                tokenInfo: initialInfoResult.success ? initialInfoResult.data : null, // Сохраняем начальную инфу
                status: 'starting',
                // error и lastTxid будут добавлены позже
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
        // 1. Находим процесс в текущем состоянии, чтобы убедиться, что он еще существует
        const processToStop = activeProcesses[processId];
        if (!processToStop) {
            console.warn(`Attempted to stop a non-existent process with ID: ${processId}`);
            return;
        }

        // 2. Оптимистично обновляем UI, чтобы пользователь сразу увидел реакцию.
        //    Устанавливаем статус 'stopping', чтобы, например, заблокировать кнопку "Stop".
        setActiveProcesses(prev => ({
            ...prev,
            [processId]: { ...prev[processId], status: 'stopping' }
        }));

        try {
            // 3. Отправляем асинхронную команду на бэкенд для остановки.
            //    Мы не ждем (await) ответа, если не хотим блокировать UI.
            //    Но ожидание (await) может быть полезно для отлова немедленных ошибок.
            const result = await window.electronAPI.stopMint(processId);
            if (!result.success) {
                // Если бэкенд сразу вернул ошибку (например, процесс уже был остановлен)
                console.error(`Failed to send stop command for process ${processId}:`, result.error);
                // Можно откатить статус или показать ошибку
                setActiveProcesses(prev => ({
                    ...prev,
                    [processId]: { ...prev[processId], status: 'error', error: `Failed to stop: ${result.error}` }
                }));
            }
            // Если команда отправлена успешно, мы просто ждем обновления статуса
            // через `onMintProgress`, которое придет с бэкенда.

        } catch (e: any) {
            // Обработка ошибок самого вызова IPC
            console.error(`Error calling stopMint IPC for process ${processId}:`, e);
            setActiveProcesses(prev => ({
                ...prev,
                [processId]: { ...prev[processId], status: 'error', error: `IPC Error: ${e.message}` }
            }));
        }
    }, [activeProcesses]); // Зависимость от

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