"use client";

import * as React from "react";
import { useEffect, useState, useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useWallets } from "@/components/provider/wallet-provider";
import { parseUnits, formatUnits } from 'viem';
import { Card } from "@/components/ui/card.tsx";

// Тип для ответа от нового API
interface KaspacomApiResponse {
    ticker: string;
    price: number;
    marketCap: number;
    volumeUsd: number;
    // Пока не видим 24h change, поэтому делаем его опциональным
    change24h?: number;
}

// Тип для нашего итогового актива
interface PortfolioAsset {
    ticker: string;
    totalBalance: bigint;
    decimals: number;
    walletCount: number;
    price: number;
    change24h: number;
    marketCap: number;
    volume24h: number;
}

const mockPriceAPI = async (tickers: string[]): Promise<Record<string, Partial<PortfolioAsset>>> => {
    console.log("Using mock data for tickers:", tickers);
    await new Promise(resolve => setTimeout(resolve, 300)); // Имитируем небольшую задержку

    const prices: Record<string, Partial<PortfolioAsset>> = {};

    tickers.forEach(ticker => {
        let price = 0;
        let change24h = 0;

        // Добавим несколько известных значений для красоты
        if (ticker.toUpperCase() === 'KASPA') {
            price = 0.125;
            change24h = (Math.random() - 0.4) * 10; // Небольшое случайное изменение
        } else if (ticker.toUpperCase() === 'WOLFY') {
            price = 0.000081;
            change24h = (Math.random() - 0.6) * 15;
        } else {
            price = Math.random() * 0.01;
            change24h = (Math.random() - 0.5) * 20;
        }

        prices[ticker] = {
            price: price,
            change24h: change24h,
            marketCap: Math.random() * 5000000,
            volume24h: Math.random() * 100000,
        };
    });
    return prices;
};

export function PortfolioWindow() {
    const { wallets, isLoadingWallets } = useWallets();
    const [portfolio, setPortfolio] = useState<PortfolioAsset[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchAndBuildPortfolio = async () => {
            if (isLoadingWallets) { setIsLoading(true); return; }
            if (wallets.length === 0) { setPortfolio([]); setIsLoading(false); return; }

            setIsLoading(true);
            setError(null);

            try {
                // ШАГ 1: Получаем и агрегируем балансы (без изменений)
                const tokensResponse = await window.electronAPI.getTokensForAddresses(wallets.map(w => w.address));
                const aggregated = new Map<string, { totalBalance: bigint; decimals: number; walletAddresses: Set<string>; }>();

                for (const address in tokensResponse) {
                    for (const token of tokensResponse[address]) {
                        if (!token.label) continue;
                        const existing = aggregated.get(token.label);
                        const cleanBalanceString = token.balance.replace(/,/g, '');
                        const balanceBigInt = parseUnits(cleanBalanceString, token.decimals);

                        if (existing) {
                            existing.totalBalance += balanceBigInt;
                            existing.walletAddresses.add(address);
                        } else {
                            aggregated.set(token.label, { totalBalance: balanceBigInt, decimals: token.decimals, walletAddresses: new Set([address]) });
                        }
                    }
                }

                if (aggregated.size === 0) {
                    setPortfolio([]);
                    return;
                }

                // ШАГ 2: "Запрашиваем" рыночные данные из нашей заглушки
                const tickers = Array.from(aggregated.keys());
                const marketData = await mockPriceAPI(tickers);

                // ШАГ 3: Собираем все вместе
                const finalPortfolio: PortfolioAsset[] = Array.from(aggregated.entries()).map(([ticker, balanceData]) => {
                    const marketInfo = marketData[ticker] || {}; // Получаем данные или пустой объект
                    return {
                        ticker: ticker,
                        totalBalance: balanceData.totalBalance,
                        decimals: balanceData.decimals,
                        walletCount: balanceData.walletAddresses.size,
                        price: marketInfo.price ?? 0,
                        marketCap: marketInfo.marketCap ?? 0,
                        volume24h: marketInfo.volume24h ?? 0,
                        change24h: marketInfo.change24h ?? 0,
                    };
                });

                finalPortfolio.sort((a, b) => (parseFloat(formatUnits(b.totalBalance, b.decimals)) * b.price) - (parseFloat(formatUnits(a.totalBalance, a.decimals)) * a.price));
                setPortfolio(finalPortfolio);

            } catch (e: any) {
                console.error("Portfolio build failed:", e);
                setError(e.message);
            } finally {
                setIsLoading(false);
            }
        };

        fetchAndBuildPortfolio();
    }, [wallets, isLoadingWallets]);

    const totalPortfolioValue = useMemo(() => {
        return portfolio.reduce((sum, asset) => {
            const value = parseFloat(formatUnits(asset.totalBalance, asset.decimals)) * asset.price;
            return sum + value;
        }, 0);
    }, [portfolio]);


    const renderLoadingState = () => (
        Array.from({ length: 5 }).map((_, index) => (
            <TableRow key={index}>
                <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                <TableCell><Skeleton className="h-6 w-32" /></TableCell>
                <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                <TableCell className="text-right"><Skeleton className="h-6 w-8" /></TableCell>
            </TableRow>
        ))
    );

    return (
        <div className="w-full">
            <div className="mb-4">
                <p className="text-sm text-muted-foreground">Total Portfolio Value</p>
                <h2 className="text-3xl font-bold tracking-tight">
                    {isLoading ? <Skeleton className="h-9 w-48" /> : `$${totalPortfolioValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </h2>
            </div>
            <Card>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Asset</TableHead>
                            <TableHead>Price</TableHead>
                            <TableHead>24h Change</TableHead>
                            <TableHead>Balance</TableHead>
                            <TableHead>Value</TableHead>
                            <TableHead>Market Cap</TableHead>
                            <TableHead>Volume (24h)</TableHead>
                            <TableHead className="text-right">Wallets</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? renderLoadingState() : (
                            error ? ( <TableRow><TableCell colSpan={8} className="text-center h-24 text-red-500">Error: {error}</TableCell></TableRow> )
                                : portfolio.length > 0 ? portfolio.map(asset => {
                                    const formattedBalance = formatUnits(asset.totalBalance, asset.decimals);
                                    const value = parseFloat(formattedBalance) * asset.price;
                                    return (
                                        <TableRow key={asset.ticker}>
                                            <TableCell className="font-medium">{asset.ticker}</TableCell>
                                            <TableCell>${asset.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}</TableCell>
                                            <TableCell className={asset.change24h >= 0 ? 'text-green-500' : 'text-red-500'}>
                                                {asset.change24h.toFixed(2)}%
                                            </TableCell>
                                            <TableCell>{parseFloat(formattedBalance).toLocaleString('en-US', { maximumFractionDigits: 4 })}</TableCell>
                                            <TableCell>${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                            <TableCell>${asset.marketCap.toLocaleString('en-US', { maximumFractionDigits: 0 })}</TableCell>
                                            <TableCell>${asset.volume24h.toLocaleString('en-US', { maximumFractionDigits: 0 })}</TableCell>
                                            <TableCell className="text-right">{asset.walletCount}</TableCell>
                                        </TableRow>
                                    )
                                }) : ( <TableRow><TableCell colSpan={8} className="text-center h-24">No assets found.</TableCell></TableRow> )
                        )}
                    </TableBody>
                </Table>
            </Card>
        </div>
    );
}