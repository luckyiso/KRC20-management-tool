"use client";

import { useState } from "react";
import { Wallet } from "@/components/provider/wallet-provider.tsx";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card.tsx";

import { Label } from "@/components/ui/label.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Slider } from "@/components/ui/slider";
import {SelectWalletWithFund} from "@/components/pages/wallet-manager/operationsWindow/consolidateTab/select-wallet-with-fund.tsx";

interface MintFormProps {
    onStartMint: (params: { wallets: Wallet[]; ticker: string; amount: number; fee: string; }) => void;
}

export function MintForm({ onStartMint }: MintFormProps) {
    const [selectedWallets, setSelectedWallets] = useState<Wallet[]>([]);
    const [ticker, setTicker] = useState("");
    const [mintAmount, setMintAmount] = useState(100);
    const [fee, setFee] = useState("0.00001");
    const [isStarting, setIsStarting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleNext = async () => {
        if (selectedWallets.length === 0 || !ticker || mintAmount <= 0) {
            setError("Please select at least one wallet, enter a ticker, and set an amount.");
            return;
        }

        setError(null);
        setIsStarting(true);
        try {
            onStartMint({
                wallets: selectedWallets,
                ticker,
                amount: mintAmount,
                fee
            });
        } catch (e: any) {
            setError(e.message || "An unexpected error occurred.");
        } finally {
            setIsStarting(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Mint KRC-20 Token</CardTitle>
                <CardDescription>Select one or more wallets to start minting simultaneously.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div>
                    <Label>Wallets</Label>
                    <SelectWalletWithFund
                        isMultiSelect={true}
                        onSelectWallets={setSelectedWallets}
                        initialSelectedWalletAddresses={selectedWallets.map(w => w.address)}
                        placeholderText="Select wallet(s)..."
                    />
                </div>
                <div>
                    <Label htmlFor="ticker">Ticker</Label>
                    <Input id="ticker" placeholder="e.g. ABOBA" value={ticker} onChange={(e) => setTicker(e.target.value)} />
                </div>
                <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <Label htmlFor="amount">Amount (per wallet):</Label>
                        <Input id="amount-input" type="number" className="w-24 text-center" value={mintAmount} onChange={(e) => setMintAmount(Math.max(0, parseInt(e.target.value, 10) || 0))} />
                    </div>
                    <Slider id="amount" min={1} max={1000} step={1} value={[mintAmount]} onValueChange={(value) => setMintAmount(value[0])} />
                </div>
                <div>
                    <Label htmlFor="fee">Upper limit transaction fee</Label>
                    <Input id="fee" type="text" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="Fee in KAS" />
                </div>
                {error && <p className="text-red-500 text-sm text-center pt-2">{error}</p>}
            </CardContent>
            <CardFooter>
                <Button className="w-full" onClick={handleNext} disabled={isStarting || selectedWallets.length === 0 || !ticker}>
                    {isStarting ? "Sending to processes..." : "Start Minting"}
                </Button>
            </CardFooter>
        </Card>
    );
}