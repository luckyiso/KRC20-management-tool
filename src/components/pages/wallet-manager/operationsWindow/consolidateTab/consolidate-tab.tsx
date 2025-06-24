// src/components/operationsWindow/consolidateTab/consolidate-tab.tsx
"use client"

import * as React from "react";
import { SelectWalletWithFund } from "./select-wallet-with-fund.tsx";
import { SelectFundAll, FundWithIndividualBalances } from "./select-fund-all.tsx";
import { Wallet, useWallets } from "@/components/provider/wallet-provider.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Input } from "@/components/ui/input.tsx";
import { NumericFormat } from 'react-number-format';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Loader2 } from "lucide-react";
import {KaspaWalletToken} from "@/api/BalanceChecker/krc20-balance.ts";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;
const ShadcnInput = React.forwardRef<HTMLInputElement, InputProps>((props, ref) => {
    return <Input {...props} ref={ref} />;
});

export function ConsolidateTab() {
    // --- НОВЫЕ СОСТОЯНИЯ ДЛЯ ДАННЫХ И ЗАГРУЗКИ ---
    const [allFundsWithBalances, setAllFundsWithBalances] = React.useState<FundWithIndividualBalances[]>([]);
    const [isLoadingData, setIsLoadingData] = React.useState(true);
    const [dataError, setDataError] = React.useState<string | null>(null);

    const [selectedAsset, setSelectedAsset] = React.useState<FundWithIndividualBalances | null>(null);
    const [selectedSourceWallets, setSelectedSourceWallets] = React.useState<Wallet[]>([]);
    const [selectedDestinationWallet, setSelectedDestinationWallet] = React.useState<Wallet | null>(null);
    const [amountPerSourceStr, setAmountPerSourceStr] = React.useState<string>("");
    const [numericAmountPerSource, setNumericAmountPerSource] = React.useState<number | null>(null);

    const [isSending, setIsSending] = React.useState(false);
    const [transactionError, setTransactionError] = React.useState<string | null>(null);
    const [transactionSuccess, setTransactionSuccess] = React.useState<string | null>(null);
    const [balanceCheckError, setBalanceCheckError] = React.useState<string | null>(null);

    const { wallets: allWallets, isLoadingWallets } = useWallets(0);

    // --- ГЛАВНЫЙ ЭФФЕКТ ДЛЯ ЗАГРУЗКИ ВСЕХ ДАННЫХ ОДНИМ ЗАПРОСОМ ---
    React.useEffect(() => {
        const fetchAllData = async () => {
            // Ждем, пока кошельки загрузятся, и убеждаемся, что они есть
            if (isLoadingWallets || allWallets.length === 0) {
                // Если кошельков нет после загрузки, выходим
                if (!isLoadingWallets && allWallets.length === 0) {
                    setIsLoadingData(false);
                }
                return;
            }

            setIsLoadingData(true);
            setDataError(null);

            // 1. Собираем адреса всех кошельков в массив строк
            const walletAddresses = allWallets.map(wallet => wallet.address);

            try {
                // 2. Вызываем API с правильным именем и параметрами
                const tokensByAddressObject = await window.electronAPI.getTokensForAddresses(walletAddresses);
                const tokensByAddress = new Map<string, KaspaWalletToken[]>(Object.entries(tokensByAddressObject));

                // 3. Трансформируем данные в нужный формат (FundWithIndividualBalances[])
                const aggregatedFunds = new Map<string, FundWithIndividualBalances>();

                for (const [address, tokens] of tokensByAddress.entries()) {
                    for (const token of tokens) {
                        if (!aggregatedFunds.has(token.value)) {
                            // Если видим этот актив впервые, создаем для него запись
                            aggregatedFunds.set(token.value, {
                                value: token.value,
                                label: token.label,
                                decimals: token.decimals,
                                balance: "0", // Общий баланс будет посчитан
                                individualBalances: new Map<string, string>(),
                            });
                        }

                        const fund = aggregatedFunds.get(token.value)!;

                        // Суммируем общий баланс
                        const currentTotal = parseFloat(fund.balance.replace(/,/g, ''));
                        const currentTokenBalance = parseFloat(token.balance.replace(/,/g, ''));
                        fund.balance = (currentTotal + currentTokenBalance).toLocaleString('en-US', {
                            minimumFractionDigits: token.decimals || 0,
                            maximumFractionDigits: token.decimals || 8,
                            useGrouping: false
                        });


                        // Записываем индивидуальный баланс для каждого кошелька
                        fund.individualBalances!.set(address, token.balance);
                    }
                }

                setAllFundsWithBalances(Array.from(aggregatedFunds.values()));

            } catch (error: any) {
                console.error("Failed to load funds data:", error);
                setDataError(`Failed to load asset data: ${error.message || String(error)}`);
            } finally {
                setIsLoadingData(false);
            }
        };

        fetchAllData();
    }, [allWallets, isLoadingWallets]);

    const handleSelectAsset = React.useCallback((fund: FundWithIndividualBalances | null) => {
        setSelectedAsset(fund);
        // Сбрасываем зависимые поля при смене актива
        setSelectedSourceWallets([]);
        setAmountPerSourceStr("");
        setNumericAmountPerSource(null);
        setBalanceCheckError(null);
        setTransactionError(null);
        setTransactionSuccess(null);
    }, []);

    const handleSelectSourceWallets = React.useCallback((wallets: Wallet[]) => {
        setSelectedSourceWallets(wallets);
        setBalanceCheckError(null);
    }, []);

    const handleSelectDestinationWallet = React.useCallback((wallet: Wallet | null) => {
        setSelectedDestinationWallet(wallet);
    }, []);

    const handleAmountChange = React.useCallback((values: { value: string; floatValue?: number; }) => {
        setAmountPerSourceStr(values.value);
        setNumericAmountPerSource(values.floatValue ?? null);
        setTransactionError(null);
    }, []);

    // Проверка балансов остаётся такой же, как у вас
    React.useEffect(() => {
        if (!selectedAsset || !selectedAsset.individualBalances || selectedSourceWallets.length === 0 || numericAmountPerSource === null || numericAmountPerSource <= 0) {
            setBalanceCheckError(null);
            return;
        }

        let errors: string[] = [];
        const amountNeededPerSource = numericAmountPerSource;
        const decimals = selectedAsset.decimals || 8;

        selectedSourceWallets.forEach(sourceWallet => {
            const balanceStr = selectedAsset.individualBalances?.get(sourceWallet.address);
            if (balanceStr === undefined) {
                errors.push(`${sourceWallet.name || sourceWallet.address.slice(0, 6)}: no ${selectedAsset.label} balance info.`);
                return;
            }
            const balanceNum = parseFloat(balanceStr.replace(/,/g, ''));
            if (isNaN(balanceNum) || balanceNum < amountNeededPerSource) {
                errors.push(`${sourceWallet.name || sourceWallet.address.slice(0, 6)}: has ${balanceStr}, needs ${amountNeededPerSource.toFixed(decimals)}.`);
            }
        });

        if (errors.length > 0) {
            setBalanceCheckError(`Balance issues: ${errors.join('; ')}`);
        } else {
            setBalanceCheckError(null);
        }
    }, [selectedAsset, selectedSourceWallets, numericAmountPerSource]);


    const handleSendTransaction = React.useCallback(async () => {
        setTransactionError(null);
        setTransactionSuccess(null);

        if (!selectedAsset) {
            setTransactionError("Please select an asset."); return;
        }

        if (selectedSourceWallets.length === 0) {
            setTransactionError("Please select at least one source wallet."); return;
        }

        if (!selectedDestinationWallet) {
            setTransactionError("Please select a destination wallet."); return;
        }

        if (numericAmountPerSource === null || numericAmountPerSource <= 0) {
            setTransactionError("Please enter a valid amount per source."); return;
        }

        if (balanceCheckError) { // Если есть ошибки проверки баланса
            setTransactionError(balanceCheckError); return;
        }

        setIsSending(true);
        try {
            const decimals = selectedAsset.decimals || 8;
            const amountToSendPerSourceStr = numericAmountPerSource.toFixed(decimals);
            const participatingSourceAddresses: string[] = [];
            selectedSourceWallets.forEach(sw => {
                const balanceStr = selectedAsset.individualBalances?.get(sw.address);
                if (balanceStr) {
                    const balanceNum = parseFloat(balanceStr.replace(/,/g, ''));
                    if (!isNaN(balanceNum) && balanceNum >= numericAmountPerSource) {
                        participatingSourceAddresses.push(sw.address);
                    }
                }
            });

            if (participatingSourceAddresses.length === 0) {
                setTransactionError(`No source wallets have sufficient funds after final check.`);
                setIsSending(false);
                return;
            }
            const recipientOutputs = [{
                address: selectedDestinationWallet.address,
// Сумма для получателя - это сумма со всех источников
// НО! API sendFunds может ожидать, что вы сами укажете, сколько с каждого источника.
// Если API ожидает total, то: (numericAmountPerSource * participatingSourceAddresses.length).toFixed(decimals)
// Если API обрабатывает "каждый источник отправляет X", то в outputs amount может быть не важен,
// а важен параметр amount для каждого источника.
// Для KASPA sendFunds, если тип multipleToSingle, он обычно сам берет с каждого sourceAddress указанную сумму
// и складывает на recipient. Либо нужно передавать input-ы.
// Уточните, как работает ваше window.electronAPI.sendFunds для multipleToSingle.
// Пока предположим, что API само разберется с суммированием, если ему передать sourceAddresses и один recipient
// с общей суммой (или если оно ожидает сумму *на каждый* инпут - тогда это amountToSendPerSourceStr)
//
// Для консолидации, где каждый источник шлет ОДИНАКОВУЮ СУММУ, а API ожидает массив источников
// и одного получателя с ОБЩЕЙ суммой:
                amount: (numericAmountPerSource * participatingSourceAddresses.length).toFixed(decimals)
            }];
            const txResult = await window.electronAPI.sendFunds(
                participatingSourceAddresses, // Массив адресов источников
                recipientOutputs, // Массив с одним объектом-получателем
                'multipleToSingle', // Тип операции
                selectedAsset.label, // Или selectedAsset.value
                "0.0001" // Комиссия
            );

            if (txResult.success) {
                setTransactionSuccess(`Consolidation successful! TxID: ${txResult.txid}`);
                setSelectedAsset(null);
                setSelectedSourceWallets([]);
                setSelectedDestinationWallet(null);
                setAmountPerSourceStr("");
                setNumericAmountPerSource(null);
                setBalanceCheckError(null);
            } else {
                setTransactionError(`Transaction error: ${txResult.error || "Unknown error"}`);
            }
        } catch (error: any) {
            setTransactionError(`Failed to send transaction: ${error.message || String(error)}`);
        } finally {
            setIsSending(false);
        }
    }, [selectedAsset, selectedSourceWallets, selectedDestinationWallet, numericAmountPerSource, balanceCheckError]);

    const isButtonDisabled = isSending ||
        !selectedAsset ||
        selectedSourceWallets.length === 0 ||
        !selectedDestinationWallet ||
        numericAmountPerSource === null ||
        numericAmountPerSource <= 0 ||
        !!balanceCheckError ||
        isLoadingData;

    // --- УЛУЧШЕННОЕ ОТОБРАЖЕНИЕ СОСТОЯНИЯ ЗАГРУЗКИ И ОШИБОК ---
    if (isLoadingData) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Consolidate Funds</CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-center space-x-2">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span>Loading assets data...</span>
                </CardContent>
            </Card>
        );
    }

    if (dataError) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Error</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-red-600">{dataError}</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Consolidate Funds</CardTitle>
                <CardDescription>
                    Select an asset, source wallets, amount per source, and a destination wallet.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div>
                    <Label htmlFor="consolidate-asset">Asset to Consolidate</Label>
                    <SelectFundAll
                        allFunds={allFundsWithBalances} // <-- Передаем загруженные данные
                        onSelectFund={handleSelectAsset}
                        initialSelectedFundValue={selectedAsset?.value}
                    />
                </div>
                <div>
                    <Label htmlFor="consolidate-source-wallets">From (Source Wallets)</Label>
                    <SelectWalletWithFund
                        activeAsset={selectedAsset} // <-- Фильтр по этому активу
                        onSelectWallets={handleSelectSourceWallets}
                        initialSelectedWalletAddresses={selectedSourceWallets.map(w => w.address)}
                        excludeWalletAddresses={selectedDestinationWallet ? [selectedDestinationWallet.address] : []}
                        disabled={!selectedAsset}
                        placeholderText="Select source wallets..."
                        isMultiSelect={true} // <-- Указываем, что это мульти-селект
                    />
                </div>
                <div>
                    <Label htmlFor="consolidate-amount-per-source">Amount (from each source)</Label>
                    <NumericFormat
                        id="consolidate-amount-per-source"
                        value={amountPerSourceStr}
                        onValueChange={handleAmountChange}
                        thousandSeparator=","
                        decimalSeparator="."
                        decimalScale={selectedAsset?.decimals ?? 8}
                        customInput={ShadcnInput}
                        disabled={!selectedAsset || selectedSourceWallets.length === 0}
                        placeholder={`0.${'0'.repeat(selectedAsset?.decimals ?? 8)}`}
                    />
                    {balanceCheckError && (
                        <p className="text-xs text-red-600 pt-1">{balanceCheckError}</p>
                    )}
                </div>
                <div>
                    <Label htmlFor="consolidate-destination-wallet">To (Destination Wallet)</Label>
                    <SelectWalletWithFund
                        id="consolidate-destination-wallet"
                        onSelectWallet={handleSelectDestinationWallet} // <-- onSelectWallet для одиночного выбора
                        initialSelectedWalletAddress={selectedDestinationWallet?.address}
                        excludeWalletAddresses={selectedSourceWallets.map(w => w.address)}
                        activeAsset={null} // <-- Фильтр не нужен
                        disabled={selectedSourceWallets.length === 0}
                        isMultiSelect={false} // <-- Указываем, что это одиночный выбор
                        placeholderText="Select destination wallet..."
                    />
                </div>

                {transactionError && <p className="text-sm text-red-600 pt-2">{transactionError}</p>}
                {transactionSuccess && <p className="text-sm text-green-600 pt-2">{transactionSuccess}</p>}
            </CardContent>
            <CardFooter>
                <Button onClick={handleSendTransaction} disabled={isButtonDisabled} className="w-full md:w-auto">
                    {isSending ? "Consolidating..." : "Consolidate Funds"}
                </Button>
            </CardFooter>
        </Card>
    );
}