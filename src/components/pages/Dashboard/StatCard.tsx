import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface MarketStatsCardProps {
    data?: {
        price?: number;
        priceChange24h?: number;
        volume24h?: number;
        marketCap?: number;
        rank?: number;
    };
    isLoading: boolean;
}

interface StatCardProps {
    title: string;
    value: string;
    icon?: React.ReactNode;
    isLoading: boolean;
}

export function MarketStatsCard({ data, isLoading }: MarketStatsCardProps) {
    if (isLoading) {
        return (
            <Card className="h-full">
                <CardHeader><CardTitle>KAS Market Stats</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-6 w-full" />
                </CardContent>
            </Card>
        );
    }

    if (!data || data.price === undefined) {
        return <Card><CardHeader><CardTitle>Market Data Unavailable</CardTitle></CardHeader></Card>;
    }

    const formatCurrency = (value?: number) =>
        value !== undefined ? `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : 'N/A';

    const formatPrice = (value: number) =>
        `$${value.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;

    const priceChange = data.priceChange24h ?? 0;

    return (
        <Card className="h-full">
            <CardHeader><CardTitle>KAS Market Stats</CardTitle></CardHeader>
            <CardContent className="space-y-4">
                <div className="flex justify-between items-baseline">
                    <span className="text-sm text-muted-foreground">Price (USD)</span>
                    <div className="flex items-center gap-2">
                        <span className="text-lg font-bold">{formatPrice(data.price)}/KAS</span>
                        <Badge variant={priceChange >= 0 ? "default" : "destructive"}>
                            {priceChange.toFixed(2)}%
                        </Badge>
                    </div>
                </div>
                <div className="flex justify-between items-baseline">
                    <span className="text-sm text-muted-foreground">Market Cap</span>
                    <span className="text-lg font-bold">{formatCurrency(data.marketCap)}</span>
                </div>
                <div className="flex justify-between items-baseline">
                    <span className="text-sm text-muted-foreground">Volume (24H)</span>
                    <span className="text-lg font-bold">{formatCurrency(data.volume24h)}</span>
                </div>
                <div className="flex justify-between items-baseline">
                    <span className="text-sm text-muted-foreground">Ranking</span>
                    <span className="text-lg font-bold">#{data.rank ?? 'N/A'}</span>
                </div>
                <div className="h-24 bg-muted rounded-md mt-4 flex items-center justify-center">
                    <p className="text-sm text-muted-foreground">Chart Area</p>
                </div>
            </CardContent>
        </Card>
    );
}

export function StatCard({ title, value, icon, isLoading }: StatCardProps) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                    {title}
                </CardTitle>
                {icon && <div className="text-muted-foreground">{icon}</div>}
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <Skeleton className="h-8 w-3/4 mt-1" />
                ) : (
                    <div className="text-2xl font-bold">{value}</div>
                )}
            </CardContent>
        </Card>
    );
}