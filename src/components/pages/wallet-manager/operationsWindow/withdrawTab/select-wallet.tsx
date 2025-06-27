"use client"

import * as React from "react"
import {ChevronsUpDown } from "lucide-react"

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

interface SelectWalletProps {
    filterWalletsBy?: 0;
    onSelectWallet?: (wallet: Wallet | null) => void;
    initialSelectedWalletAddress?: string;
}

export function SelectWallet({onSelectWallet, initialSelectedWalletAddress }: SelectWalletProps) {
    const { wallets, isLoadingWallets, errorLoadingWallets } = useWallets(0);

    const [open, setOpen] = React.useState(false)
    const [selectedValue, setSelectedValue] = React.useState(initialSelectedWalletAddress || "")

    React.useEffect(() => {
        if (initialSelectedWalletAddress) {
            setSelectedValue(initialSelectedWalletAddress);
        }
    }, [initialSelectedWalletAddress]);

    const formattedWallets = React.useMemo(() => {
        if (isLoadingWallets) {
            return [];
        }
        if (errorLoadingWallets) {
            console.error("Error loading wallets for SelectWallet:", errorLoadingWallets);
            return [];
        }
        return wallets.map(wallet => ({
            value: wallet.address,
            label: wallet.name || wallet.address,
            originalWallet: wallet
        }));
    }, [wallets, isLoadingWallets, errorLoadingWallets]);

    const selectedWalletLabel = React.useMemo(() => {
        const foundWallet = formattedWallets.find((wallet) => wallet.value === selectedValue);
        return foundWallet ? foundWallet.label : "Select wallet...";
    }, [selectedValue, formattedWallets]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-[350px] justify-between"
                    disabled={isLoadingWallets || errorLoadingWallets !== null}
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
                                                if (onSelectWallet) {
                                                    onSelectWallet(found.originalWallet);
                                                }
                                            }
                                        }}
                                        className="flex items-center"
                                    >
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
