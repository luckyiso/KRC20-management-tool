"use client"

import * as React from "react"
import { ChevronsUpDown } from "lucide-react"

import { Button } from "@/components/ui/button.tsx"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command.tsx"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover.tsx"

import { useWallets, Wallet } from "@/components/provider/wallet-provider.tsx";
import {Checkbox} from "@/components/ui/checkbox.tsx";

interface SelectWalletWithdrawalProps {
    excludeWalletAddress?: string | null;
    onSelectWallet: (wallet: Wallet | null) => void;
    initialSelectedWalletAddress?: string;
}

export function SelectWalletWithdrawal({ excludeWalletAddress, onSelectWallet, initialSelectedWalletAddress }: SelectWalletWithdrawalProps) {
    const { wallets, isLoadingWallets, errorLoadingWallets } = useWallets(1);

    const [open, setOpen] = React.useState(false)
    const [selectedValue, setSelectedValue] = React.useState(initialSelectedWalletAddress || "")

    React.useEffect(() => {
    if (initialSelectedWalletAddress && initialSelectedWalletAddress !== selectedValue) {
        setSelectedValue(initialSelectedWalletAddress);
        const walletToSelect = wallets.find(w => w.address === initialSelectedWalletAddress);
        if (walletToSelect) {
            onSelectWallet(walletToSelect);
        }
    }
    if (excludeWalletAddress && selectedValue === excludeWalletAddress) {
        setSelectedValue("");
        onSelectWallet(null);
    }
}, [initialSelectedWalletAddress, excludeWalletAddress, wallets, onSelectWallet, selectedValue]);

    const formattedWallets = React.useMemo(() => {
        if (isLoadingWallets || errorLoadingWallets) {
            return [];
        }

        const filtered = wallets.filter(wallet =>
            excludeWalletAddress ? wallet.address !== excludeWalletAddress : true
        );

        return filtered.map(wallet => ({
            value: wallet.address,
            label: wallet.name || wallet.address,
            originalWallet: wallet
        }));
    }, [wallets, isLoadingWallets, errorLoadingWallets, excludeWalletAddress]);

    const selectedWalletLabel = React.useMemo(() => {
        const foundWallet = formattedWallets.find((wallet) => wallet.value === selectedValue);
        return foundWallet ? foundWallet.label : "Select recipient wallet...";
    }, [selectedValue, formattedWallets]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-[350px] justify-between"
                    disabled={isLoadingWallets || errorLoadingWallets !== null || formattedWallets.length === 0}
                >
                    {selectedWalletLabel}
                    <ChevronsUpDown className="opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[350px] p-0">
                <Command>
                    <CommandInput placeholder="Search wallet..." className="h-9" />
                    <CommandList>
                        {isLoadingWallets ? (
                            <CommandEmpty>Loading wallets...</CommandEmpty>
                        ) : errorLoadingWallets ? (
                            <CommandEmpty>Error: {errorLoadingWallets}</CommandEmpty>
                        ) : formattedWallets.length === 0 ? (
                            <CommandEmpty>No wallets found.</CommandEmpty>
                        ) : (
                            <CommandGroup>
                                {formattedWallets.map((wallet) => (
                                    <CommandItem
                                        key={wallet.value}
                                        value={wallet.label}
                                        onSelect={(currentLabel) => {
                                            const found = formattedWallets.find(w => w.label.toLowerCase() === currentLabel.toLowerCase());
                                            if (found) {
                                                setSelectedValue(found.value);
                                                setOpen(false);
                                                onSelectWallet(found.originalWallet);
                                            } else {
                                                setSelectedValue("");
                                                onSelectWallet(null);
                                            }
                                        }}
                                    >
                                        <Checkbox
                                            checked={selectedValue === wallet.value}
                                            className="mr-2"
                                        />
                                        {wallet.label}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    )
}
