"use client";

import { useState, useMemo, useEffect } from "react";
import { Wallet } from "@/components/provider/wallet-provider.tsx";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { SelectWallet } from "@/components/pages/wallet-manager/operationsWindow/withdrawTab/select-wallet.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Button } from "@/components/ui/button.tsx";


function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);
        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);
    return debouncedValue;
}

const DEPLOY_FEE = 1011;

interface FormState {
    selectedWallet: Wallet | null;
    ticker: string;
    maxSupply: string;
    mintLimit: string;
    preAllocation: string;
    decimals: string;
}

const INITIAL_FORM_STATE: FormState = {
    selectedWallet: null,
    ticker: '',
    maxSupply: '',
    mintLimit: '',
    preAllocation: '',
    decimals: '8',
};

export function Deploy() {
    const [formState, setFormState] = useState<FormState>(INITIAL_FORM_STATE);
    const [isDeploying, setIsDeploying] = useState(false);
    const [submissionError, setSubmissionError] = useState<string | null>(null);
    const [submissionSuccess, setSubmissionSuccess] = useState<string | null>(null);

    const [walletBalance, setWalletBalance] = useState<number>(0);
    const [isTickerAvailable, setIsTickerAvailable] = useState<boolean | null>(null);
    const [isCheckingTicker, setIsCheckingTicker] = useState(false);

    const debouncedTicker = useDebounce(formState.ticker, 500);

    useEffect(() => {
        if (!debouncedTicker || !/^[A-Z]{4,6}$/.test(debouncedTicker)) {
            setIsTickerAvailable(null);
            return;
        }
        const checkTicker = async () => {
            setIsCheckingTicker(true);
            try {
                const result = await window.electronAPI.deploy('checkTicker', { ticker: debouncedTicker });
                setIsTickerAvailable(result.success ? (result.available ?? false) : false);

            } catch (e) {
                setIsTickerAvailable(false);
            } finally {
                setIsCheckingTicker(false);
            }
        };
        checkTicker();
    }, [debouncedTicker]);

    useEffect(() => {
        if (formState.selectedWallet && formState.selectedWallet.balance) {
            const balanceString = formState.selectedWallet.balance;
            const cleanBalanceString = balanceString.replace(/,/g, '');
            const balance = parseFloat(cleanBalanceString) || 0;

            setWalletBalance(balance);
        } else {
            setWalletBalance(0);
        }
    }, [formState.selectedWallet]);

    const validation = useMemo(() => {
        const errors: Partial<Record<keyof FormState, string>> = {};

        if (!formState.ticker) errors.ticker = "Ticker is required.";
        else if (!/^[A-Z]{4,6}$/.test(formState.ticker)) errors.ticker = "Must be 4-6 uppercase letters.";
        else if (isTickerAvailable === false) errors.ticker = "This ticker is already taken.";

        if (!formState.maxSupply) errors.maxSupply = "Max Supply is required.";
        if (!formState.mintLimit) errors.mintLimit = "Amount per mint is required.";

        const hasSufficientBalance = walletBalance >= DEPLOY_FEE;
        const isFormValid = Object.keys(errors).length === 0 && !!formState.selectedWallet && isTickerAvailable === true;

        return { errors, isFormValid, hasSufficientBalance };
    }, [formState, walletBalance, isTickerAvailable]);

    const handleDeploy = async () => {
        if (!validation.isFormValid || !validation.hasSufficientBalance) return;

        setIsDeploying(true);
        setSubmissionError(null);
        setSubmissionSuccess(null);

        try {
            const result = await window.electronAPI.deploy('deploy', {
                walletAddress: formState.selectedWallet!.address,
                ticker: formState.ticker,
                maxSupply: formState.maxSupply,
                mintLimit: formState.mintLimit,
                preAllocationAmount: formState.preAllocation,
                decimals: formState.decimals,
            });

            if (result.success) {
                setSubmissionSuccess(`Token deployed successfully! TXID: ${result.txid}`);
                setFormState(INITIAL_FORM_STATE);
            } else {
                setSubmissionError(result.error ?? null);
            }
        } catch (e: any) {
            setSubmissionError(e.message || "An unknown error occurred.");
        } finally {
            setIsDeploying(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Deploy KRC-20 Token</CardTitle>
                <CardDescription>Fill in the details to deploy your own token on the Kaspa network.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div>
                    <Label>Deployer Wallet</Label>
                    <SelectWallet
                        onSelectWallet={(wallet) => setFormState(prev => ({ ...prev, selectedWallet: wallet }))}
                        initialSelectedWalletAddress={formState.selectedWallet?.address}
                    />
                    {formState.selectedWallet && !validation.hasSufficientBalance && (
                        <p className="text-sm text-red-500 mt-2">
                            Need at least {DEPLOY_FEE} KAS to deploy a KRC20 token. Current balance: {walletBalance.toFixed(4)} KAS.
                        </p>
                    )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <Label htmlFor="ticker">Ticker</Label>
                        <Input
                            id="ticker"
                            placeholder="MYTKN"
                            value={formState.ticker}
                            onChange={(e) => setFormState(prev => ({ ...prev, ticker: e.target.value.toUpperCase() }))}
                            maxLength={6}
                        />
                        {validation.errors.ticker && <p className="text-sm text-red-500 mt-1">{validation.errors.ticker}</p>}
                        {isCheckingTicker && <p className="text-sm text-muted-foreground mt-1">Checking availability...</p>}
                    </div>
                    <div>
                        <Label htmlFor="decimals">Decimal (Optional)</Label>
                        <Input
                            id="decimals"
                            type="number"
                            placeholder="8"
                            value={formState.decimals}
                            onChange={(e) => setFormState(prev => ({ ...prev, decimals: e.target.value }))}
                        />
                    </div>
                </div>

                <div>
                    <Label htmlFor="maxSupply">Max Supply</Label>
                    <Input
                        id="maxSupply"
                        type="text"
                        inputMode="numeric"
                        placeholder="max 287.000.000.000"
                        value={formState.maxSupply}
                        onChange={(e) => setFormState(prev => ({ ...prev, maxSupply: e.target.value.replace(/\D/g, '') }))}
                    />
                    {validation.errors.maxSupply && <p className="text-sm text-red-500 mt-1">{validation.errors.maxSupply}</p>}
                </div>

                <div>
                    <Label htmlFor="mintLimit">Amount per mint</Label>
                    <Input
                        id="mintLimit"
                        type="text"
                        inputMode="numeric"
                        placeholder="max 287.000.000.000"
                        value={formState.mintLimit}
                        onChange={(e) => setFormState(prev => ({ ...prev, mintLimit: e.target.value.replace(/\D/g, '') }))}
                    />
                    {validation.errors.mintLimit && <p className="text-sm text-red-500 mt-1">{validation.errors.mintLimit}</p>}
                </div>

                <div>
                    <Label htmlFor="preAllocation">Pre-allocation amount (Optional)</Label>
                    <Input
                        id="preAllocation"
                        type="text"
                        inputMode="numeric"
                        placeholder="Amount to allocate to yourself on deploy"
                        value={formState.preAllocation}
                        onChange={(e) => setFormState(prev => ({ ...prev, preAllocation: e.target.value.replace(/\D/g, '') }))}
                    />
                </div>

                {submissionError && <p className="text-red-500 text-center">{submissionError}</p>}
                {submissionSuccess && <p className="text-green-500 text-center">{submissionSuccess}</p>}

            </CardContent>
            <CardFooter>
                <Button
                    className="w-full"
                    onClick={handleDeploy}
                    disabled={!validation.isFormValid || !validation.hasSufficientBalance || isDeploying}
                >
                    {isDeploying ? "Deploying..." : "Next"}
                </Button>
            </CardFooter>
        </Card>
    );
}