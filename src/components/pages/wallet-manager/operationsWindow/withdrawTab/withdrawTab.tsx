
"use client"

import * as React from "react";
import { SelectWallet } from "@/components/pages/wallet-manager/operationsWindow/withdrawTab/select-wallet.tsx";
import { SelectFund, Fund } from "@/components/pages/wallet-manager/operationsWindow/withdrawTab/select-fund.tsx";
import { Wallet } from "@/components/provider/wallet-provider.tsx";
import {Label} from "@/components/ui/label.tsx";
import {SelectWalletWithdrawal} from "@/components/pages/wallet-manager/operationsWindow/withdrawTab/select-wallet-withdrawal.tsx";
import {Input} from "@/components/ui/input.tsx";
import { NumericFormat } from 'react-number-format';
import {Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from "@/components/ui/card.tsx";
import {Button} from "@/components/ui/button.tsx";
type InputProps = React.InputHTMLAttributes<HTMLInputElement>;
const ShadcnInput = React.forwardRef<HTMLInputElement, InputProps>((props, ref) => {
    return <Input {...props} ref={ref} />;
});

export function WithdrawTab() {
    const [selectedWallet, setSelectedWallet] = React.useState<Wallet | null>(null);
    const [selectedFund, setSelectedFund] = React.useState<Fund | null>(null);
    const [selectedRecipientWallet, setSelectedRecipientWallet] = React.useState<Wallet | null>(null);
    const [amount, setAmount] = React.useState<string>("");
    const [numericAmount, setNumericAmount] = React.useState<number | null>(null);
    const [isSending, setIsSending] = React.useState(false);
    const [transactionError, setTransactionError] = React.useState<string | null>(null);
    const [transactionSuccess, setTransactionSuccess] = React.useState<string | null>(null);

    const handleSelectWallet = React.useCallback((wallet: Wallet | null) => {
        console.log("Selected Wallet in parent:", wallet);
        setSelectedWallet(wallet);
        setSelectedFund(null);

    }, []);

    const handleSelectFund = React.useCallback((fund: Fund | null) => {
        console.log("Selected Fund in parent:", fund);
        setSelectedFund(fund);
    }, []);

    const handleSelectRecipientWallet = React.useCallback((wallet: Wallet | null) => {
        console.log("Selected Recipient Wallet in parent:", wallet);
        setSelectedRecipientWallet(wallet);
    }, []);

    const handleAmountChange = React.useCallback((values: {
        formattedValue: string;
        value: string;
        floatValue?: number;
    }) => {
        setAmount(values.formattedValue);
        setNumericAmount(values.floatValue !== undefined ? values.floatValue : null);
    }, []);

    const handleSendTransaction = React.useCallback(async () => {
        setTransactionError(null);
        setTransactionSuccess(null);
        setIsSending(true);

        if (!selectedWallet) {
            setTransactionError("Please select a source wallet.");
            setIsSending(false);
            return;
        }
        if (!selectedFund) {
            setTransactionError("Please select an asset.");
            setIsSending(false);
            return;
        }
        if (numericAmount === null || numericAmount <= 0) {
            setTransactionError("Please enter a valid amount.");
            setIsSending(false);
            return;
        }
        if (!selectedRecipientWallet) {
            setTransactionError("Please select a recipient wallet.");
            setIsSending(false);
            return;
        }

        try {
            const txid = await window.electronAPI.sendFunds(
                [selectedWallet.address],
                [{ address: selectedRecipientWallet.address, amount: String(numericAmount) }],
                'singleToSingle',
                selectedFund.label,
                "0.0001"
            );

            if (txid.success) {
            } else {
                setTransactionError(`Ошибка транзакции: ${txid.error}`);
            }
        } catch (error: any) {
            console.error("Ошибка при вызове IPC send-kaspa:", error);
            setTransactionError(`Не удалось отправить транзакцию: ${error.message || String(error)}`);
        } finally {
            setIsSending(false);
        }
    }, [selectedWallet, selectedFund, numericAmount, selectedRecipientWallet]);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Withdraw funds</CardTitle>
                <CardDescription>
                    Select your wallet and wallet for withdrawal
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
                <div className="space-y-1">
                    <Label>From</Label>
                    <SelectWallet onSelectWallet={handleSelectWallet}/>
                    <Label>Asset</Label>
                    <SelectFund walletAddress={selectedWallet ? selectedWallet.address : null}
                                onSelectFund={handleSelectFund}/>
                    <Label>Ammount</Label>
                    <NumericFormat
                        value={amount}
                        onValueChange={handleAmountChange}
                        thousandSeparator=" "
                        decimalSeparator="."
                        decimalScale={8}
                        fixedDecimalScale={false}
                        allowNegative={false}
                        placeholder="0"
                        customInput={ShadcnInput}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <Label>To</Label>
                    <SelectWalletWithdrawal
                        excludeWalletAddress={selectedWallet ? selectedWallet.address : null}
                        onSelectWallet={handleSelectRecipientWallet}
                    />
                    {transactionError && (
                        <div className="text-red-500 text-sm">{transactionError}</div>
                    )}
                    {transactionSuccess && (
                        <div className="text-green-500 text-sm">{transactionSuccess}</div>
                    )}
                </div>
            </CardContent>
            <CardFooter>
                <Button onClick={handleSendTransaction} disabled={isSending}>
                    {isSending ? "Sending..." : "Send"}
                </Button>
            </CardFooter>
        </Card>
    );
}
