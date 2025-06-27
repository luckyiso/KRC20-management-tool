"use client";
import { useState, useEffect, useMemo } from "react";
import { Activity, BarChart, CalendarDays, DollarSign, Gauge, Wrench, Rocket, TrendingUp } from "lucide-react";
import { MarketStatsCard, StatCard } from "./StatCard";
import {DashboardStats} from "../../../../electron/electron-env";
import {TransactionsTable} from "@/components/pages/Dashboard/TransactionsTable.tsx";

export default function DashboardPage() {
    const [stats, setStats] = useState<Partial<DashboardStats>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadStats = async () => {
            setIsLoading(true);
            const result = await window.electronAPI.getDashboardStats();
            if (result.success && result.data) {
                setStats(result.data);
            } else {
                setError(result.error || "Failed to load dashboard data.");
            }
            setIsLoading(false);
        };
        loadStats();
        const intervalId = setInterval(loadStats, 30000);
        return () => clearInterval(intervalId);
    }, []);

    const displayData = useMemo(() => {
        const formatNumber = (num?: number | string, options?: Intl.NumberFormatOptions) =>
            num !== undefined ? Number(num).toLocaleString('en-US', options) : 'N/A';
        const hashrate = stats.hashrate ? stats.hashrate / 1000 : 0;

        const circulatingSompi = stats.circulatingSupply ? BigInt(stats.circulatingSupply) : 0n;
        const maxSupplySompi = stats.maxSupply ? BigInt(stats.maxSupply) : 0n;

        const sompisInKas = 100_000_000n;
        const circulatingKas = circulatingSompi > 0n ? Number(circulatingSompi) / Number(sompisInKas) : 0;

        const currentSupplyInBillions = circulatingKas / 1e9;

        const minedPercent = (maxSupplySompi > 0n && circulatingSompi > 0n)
            ? Number(circulatingSompi * 10000n / maxSupplySompi) / 100
            : 0;

        const nextReductionDate = stats.nextHalvingDate
            ? new Date(stats.nextHalvingDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
            : 'N/A';


        return {
            daaScore: formatNumber(stats.daaScore),
            currentSupply: `${currentSupplyInBillions.toFixed(4)} B`,
            tps: "8.4 TPS",
            bps: "10.1 BPS",
            hashrate: `${formatNumber(hashrate, { maximumFractionDigits: 2 })} PH/s`,
            minedPercent: `${minedPercent.toFixed(2)} %`,
            nextReduction: nextReductionDate,
            nextReward: `${formatNumber(stats.nextReward, { maximumFractionDigits: 2 })} KAS`,
        };
    }, [stats]);

    if (error) {
        return <div className="text-red-500 text-center p-8">Error: {error}</div>;
    }

    return (
        <div className="grid gap-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                    <StatCard title="DAA Score" value={displayData.daaScore} icon={<Activity />} isLoading={isLoading} />
                    <StatCard title="Current Supply" value={displayData.currentSupply} icon={<BarChart />} isLoading={isLoading} />
                    <StatCard title="Real-Time TPS" value={displayData.tps} icon={<Rocket />} isLoading={isLoading} />
                    <StatCard title="Real-Time BPS" value={displayData.bps} icon={<TrendingUp />} isLoading={isLoading} />
                    <StatCard title="Hashrate" value={displayData.hashrate} icon={<Wrench />} isLoading={isLoading} />
                    <StatCard title="Mined %" value={displayData.minedPercent} icon={<Gauge />} isLoading={isLoading} />
                    <StatCard title="Next Reduction" value={displayData.nextReduction} icon={<CalendarDays />} isLoading={isLoading} />
                    <StatCard title="Next Reward" value={displayData.nextReward} icon={<DollarSign />} isLoading={isLoading} />
                </div>

                <div className="lg:col-span-1">
                    <MarketStatsCard data={stats as DashboardStats} isLoading={isLoading} />
                </div>
            </div>
            <div>
                <TransactionsTable />
            </div>
        </div>
    );
}