"use client";

import * as React from "react";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {MintProcess} from "@/components/pages/mint-tokens/mint-page.tsx";

// --- КАРТОЧКА ОДНОГО ПРОЦЕССА (УПРОЩЕННАЯ) ---
const MintProcessCard = ({ process, onStop }: {
    process: MintProcess;
    onStop: (id: string) => void;
}) => {
    // Вычисляем прогресс
    const { progressPercent, finished, target } = useMemo(() => {
        const finished = process.currentMints;
        const target = process.targetMints;
        const percent = target > 0 ? (finished / target) * 100 : 0;
        return { progressPercent: percent, finished, target };
    }, [process.currentMints, process.targetMints]);

    // Вычисляем оставшийся саплай
    const remainingSupply = useMemo(() => {
        const tokenInfo = process.tokenInfo;
        if (!tokenInfo || !tokenInfo.max || !tokenInfo.minted) {
            return "Loading...";
        }
        try {
            const max = BigInt(tokenInfo.max);
            const minted = BigInt(tokenInfo.minted);
            const remaining = max - minted;
            return `${remaining.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")} left`;
        } catch {
            return "N/A";
        }
    }, [process.tokenInfo]);

    return (
        <Card className="border-border">
            <CardHeader>
                <CardTitle className="flex justify-between items-center text-lg">
                    <span>{`Minting: ${process.ticker.toUpperCase()}`}</span>
                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => onStop(process.id)}
                        disabled={process.status === 'stopping' || process.status === 'stopped' || process.status === 'finished'}
                    >
                        {process.status === 'stopping' ? "Stopping..." : "Stop"}
                    </Button>
                </CardTitle>
                <CardDescription>
                    Wallet: {process.wallet.name} ({process.wallet.address.slice(0, 9)}...)
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-1">
                    <div className="flex justify-between text-sm font-medium">
                        <span>Token State</span>
                        <span>{remainingSupply}</span>
                    </div>
                    <Progress value={progressPercent} />
                    <div className="flex justify-between text-xs text-muted-foreground pt-1">
                        <span>{process.status}...</span>
                        <span>{Math.floor(progressPercent)}%</span>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div><span className="text-muted-foreground">Finished/Target:</span> {finished} / {target}</div>
                    <div><span className="text-muted-foreground">Address:</span> {process.wallet.address.slice(0, 9)}...{process.wallet.address.slice(-6)}</div>
                    <div><span className="text-muted-foreground">Current Fee:</span> {process.fee} KAS</div>
                </div>

                {/* Блок для отображения ошибок остается */}
                {process.error && <p className="text-red-500 text-xs mt-2">{process.error}</p>}

                {/* Блок для изменения комиссии полностью удален */}
            </CardContent>
        </Card>
    );
};

// --- ОСНОВНОЙ КОМПОНЕНТ-КОНТЕЙНЕР (УПРОЩЕННЫЙ) ---
interface MintOperationsProps {
    processes: MintProcess[];
    onStop: (id: string) => void;
    // prop onUpdateFee удален
}

export function CurrentMints({ processes, onStop }: MintOperationsProps) {
    return (
        <div className="space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">Active Processes</h2>
            {processes.length > 0 ? (
                processes.map(proc => (
                    <MintProcessCard
                        key={proc.id}
                        process={proc}
                        onStop={onStop}
                        // prop onUpdateFee удален
                    />
                ))
            ) : (
                <Card className="flex items-center justify-center h-40 border-dashed">
                    <p className="text-muted-foreground">No active minting processes.</p>
                </Card>
            )}
        </div>
    );
}