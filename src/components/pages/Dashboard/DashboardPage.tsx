"use client";

import * as React from "react";
import {
    Activity, BarChart, Calculator, CalendarDays, Cpu,
    DollarSign, Gauge, Rocket, TrendingUp, Wrench
} from "lucide-react";
import {MarketStatCard, StatCard} from "@/components/pages/Dashboard/StatCard.tsx"; // Импортируем больше иконок
import { TransactionsTable } from "./TransactionsTable";

export default function DashboardPage() {
    // Данные с сайта kaspa.com
    const dashboardData = {
        daaScore: "148,706,961",
        currentSupply: "26.3338 B",
        tps: "8.4 TPS",
        bps: "10.1 BPS",
        hashrate: "940.49 PH/s",
        minedPercent: "91.76 %",
        nextReduction: "16 day",
        nextReward: "4.90 KAS"
    };

    return (
        <div className="grid gap-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Левая и центральная часть с 8 карточками */}
                <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    <StatCard
                        title="DAA Score"
                        value={dashboardData.daaScore}
                        icon={<Activity className="h-4 w-4" />}
                    />
                    <StatCard
                        title="Current Supply"
                        value={dashboardData.currentSupply}
                        icon={<BarChart className="h-4 w-4" />}
                    />
                    <StatCard
                        title="Real-Time TPS"
                        value={dashboardData.tps}
                        icon={<Rocket className="h-4 w-4" />}
                    />
                    <StatCard
                        title="Real-Time BPS"
                        value={dashboardData.bps}
                        icon={<TrendingUp className="h-4 w-4" />}
                    />
                    <StatCard
                        title="Hashrate"
                        value={dashboardData.hashrate}
                        icon={<Wrench className="h-4 w-4" />}
                    />
                    <StatCard
                        title="Mined %"
                        value={dashboardData.minedPercent}
                        icon={<Gauge className="h-4 w-4" />}
                    />
                    <StatCard
                        title="Next Reduction"
                        value={dashboardData.nextReduction}
                        icon={<CalendarDays className="h-4 w-4" />}
                    />
                    <StatCard
                        title="Next Reward"
                        value={dashboardData.nextReward}
                        icon={<DollarSign className="h-4 w-4" />}
                    />
                </div>

                {/* Правая часть с рыночной статистикой */}
                <div className="lg:col-span-1">
                    <MarketStatCard />
                </div>
            </div>
            <div className="grid gap-6">
                <TransactionsTable />
            </div>
        </div>
    );
}