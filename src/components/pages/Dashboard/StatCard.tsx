import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {Badge} from "@/components/ui/badge.tsx";

interface StatCardProps {
    title: string;
    value: string;
    icon?: React.ReactNode; // Новый проп для иконки
}

const marketData = {
    priceUsd: "0.0713",
    change24h: -0.9,
    volume24h: "$80,197,423",
    marketCap: "$1,876,650,874",
    ranking: "#45"
};
export function StatCard({ title, value, icon }: StatCardProps) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                    {title}
                </CardTitle>
                {/* Отображаем иконку, если она передана */}
                {icon && <div className="text-muted-foreground">{icon}</div>}
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{value}</div>
            </CardContent>
        </Card>
    );
}

export function MarketStatCard() {
    return (
        <Card className="h-full">
            <CardHeader>
                <CardTitle>KAS Market Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Price */}
                <div className="flex justify-between items-baseline">
                    <span className="text-sm text-muted-foreground">Price (USD)</span>
                    <div className="flex items-center gap-2">
                        <span className="text-lg font-bold">${marketData.priceUsd}/KAS</span>
                        <Badge variant={marketData.change24h >= 0 ? "default" : "destructive"}>
                            {marketData.change24h}%
                        </Badge>
                    </div>
                </div>

                {/* Market Cap */}
                <div className="flex justify-between items-baseline">
                    <span className="text-sm text-muted-foreground">Market Cap</span>
                    <span className="text-lg font-bold">{marketData.marketCap}</span>
                </div>

                {/* Volume */}
                <div className="flex justify-between items-baseline">
                    <span className="text-sm text-muted-foreground">Volume (24H)</span>
                    <span className="text-lg font-bold">{marketData.volume24h}</span>
                </div>

                {/* Ranking */}
                <div className="flex justify-between items-baseline">
                    <span className="text-sm text-muted-foreground">Ranking</span>
                    <span className="text-lg font-bold">{marketData.ranking}</span>
                </div>

                {/* График-заглушка */}
                <div className="h-24 bg-muted rounded-md mt-4 flex items-center justify-center">
                    <p className="text-sm text-muted-foreground">Chart Area</p>
                </div>
            </CardContent>
        </Card>
    );
}