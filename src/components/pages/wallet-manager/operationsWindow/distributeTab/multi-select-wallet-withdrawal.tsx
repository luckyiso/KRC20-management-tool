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
import {Checkbox} from "@/components/ui/checkbox.tsx";


interface MultiSelectWalletProps {
    filterWalletsBy?: 0;
    onSelectWallets?: (wallets: Wallet[]) => void;
    initialSelectedWalletAddresses?: string[];
    excludeWalletAddresses?: string[];
}

export function MultiSelectWalletWithdrawal({ onSelectWallets, initialSelectedWalletAddresses, excludeWalletAddresses }: MultiSelectWalletProps) {
    const { wallets, isLoadingWallets, errorLoadingWallets } = useWallets(0);

    const [open, setOpen] = React.useState(false);
    const [selectedValues, setSelectedValues] = React.useState<string[]>(initialSelectedWalletAddresses || []);

    React.useEffect(() => {
        if (initialSelectedWalletAddresses) {
            setSelectedValues(initialSelectedWalletAddresses);
        }
    }, [initialSelectedWalletAddresses]);

    const formattedWallets = React.useMemo(() => {
        if (isLoadingWallets) {
            return [];
        }
        if (errorLoadingWallets) {
            console.error("Error loading wallets for MultiSelectWalletWithdrawal:", errorLoadingWallets);
            return [];
        }

        const excludedAddressesSet = new Set(excludeWalletAddresses || []);

        return wallets
            .filter(wallet =>
                !excludedAddressesSet.has(wallet.address)
            )
            .map(wallet => ({
                value: wallet.address,
                label: wallet.name || wallet.address,
                originalWallet: wallet
            }));
    }, [wallets, isLoadingWallets, errorLoadingWallets, excludeWalletAddresses]);

    const selectedWalletsLabels = React.useMemo(() => {
        const foundWallets = formattedWallets.filter((wallet) => selectedValues.includes(wallet.value));
        return foundWallets.length > 0
            ? foundWallets.map(w => w.label).join(", ")
            : "Select wallets...";
    }, [selectedValues, formattedWallets]);

    const handleToggleWallet = (walletToToggle: { value: string, label: string, originalWallet: Wallet }) => {
        const isSelected = selectedValues.includes(walletToToggle.value);
        let newSelectedValues;
        let newSelectedWalletObjects: Wallet[];

        if (isSelected) {
            newSelectedValues = selectedValues.filter((value) => value !== walletToToggle.value);
        } else {
            newSelectedValues = [...selectedValues, walletToToggle.value];
        }
        setSelectedValues(newSelectedValues);
        newSelectedWalletObjects = formattedWallets
            .filter(fw => newSelectedValues.includes(fw.value))
            .map(fw => fw.originalWallet);

        if (onSelectWallets) {
            onSelectWallets(newSelectedWalletObjects);
        }
    };

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
                    {selectedWalletsLabels}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
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
                                        onSelect={() => handleToggleWallet(wallet)}
                                        className="flex items-center cursor-pointer"
                                    >
                                        <Checkbox
                                            checked={selectedValues.includes(wallet.value)}
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
    );
}
