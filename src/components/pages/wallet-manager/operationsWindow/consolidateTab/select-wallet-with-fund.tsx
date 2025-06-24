// src/components/operationsWindow/consolidateTab/select-wallet-with-fund.tsx
"use client"

import * as React from "react"
import { ChevronsUpDown } from "lucide-react"
import { Button } from "@/components/ui/button.tsx"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command.tsx"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx"
import { useWallets, Wallet } from "@/components/provider/wallet-provider.tsx"
import { Checkbox } from "@/components/ui/checkbox.tsx"
import { FundWithIndividualBalances } from "./select-fund-all.tsx" // Убедитесь, что тип импортирован

export interface SelectWalletWithFundProps {
    id?: string;
    onSelectWallets?: (wallets: Wallet[]) => void; // Для мульти-выбора
    onSelectWallet?: (wallet: Wallet | null) => void; // Для одиночного выбора
    initialSelectedWalletAddresses?: string[]; // Для мульти-выбора
    initialSelectedWalletAddress?: string; // Для одиночного выбора
    excludeWalletAddresses?: string[];
    activeAsset?: FundWithIndividualBalances | null;
    disabled?: boolean;
    className?: string;
    placeholderText?: string;
    isMultiSelect: boolean; // <-- Новый пропс для определения режима
}

export function SelectWalletWithFund({
                                         id,
                                         onSelectWallets,
                                         onSelectWallet,
                                         initialSelectedWalletAddresses = [],
                                         initialSelectedWalletAddress,
                                         excludeWalletAddresses = [],
                                         activeAsset,
                                         disabled,
                                         placeholderText = "Select wallet(s)...",
                                         isMultiSelect,
                                     }: SelectWalletWithFundProps) {
    const { wallets: allWalletsFromContext, isLoadingWallets, errorLoadingWallets } = useWallets(0);
    const [open, setOpen] = React.useState(false);

    // Внутреннее состояние для хранения выбранных адресов (массив даже для одиночного выбора)
    const [selectedValues, setSelectedValues] = React.useState<string[]>(
        isMultiSelect ? initialSelectedWalletAddresses : (initialSelectedWalletAddress ? [initialSelectedWalletAddress] : [])
    );

    // Синхронизация с внешними изменениями
    React.useEffect(() => {
        const initial = isMultiSelect ? initialSelectedWalletAddresses : (initialSelectedWalletAddress ? [initialSelectedWalletAddress] : []);
        if (JSON.stringify(initial) !== JSON.stringify(selectedValues)) {
            setSelectedValues(initial);
        }
    }, [initialSelectedWalletAddresses, initialSelectedWalletAddress, isMultiSelect, selectedValues]);

    const availableWallets = React.useMemo(() => {
        if (isLoadingWallets) return [];

        let filtered = allWalletsFromContext;

        // 1. Фильтр по активному активу (если он есть)
        if (activeAsset && activeAsset.individualBalances) {
            const holdingAddresses = new Set(Array.from(activeAsset.individualBalances.keys()));
            filtered = filtered.filter(wallet => holdingAddresses.has(wallet.address));
        } else if (activeAsset) {
            // Актив выбран, но балансов нет - значит, ни один кошелек не подходит
            return [];
        }

        // 2. Фильтр по исключенным адресам
        const excludedSet = new Set(excludeWalletAddresses);
        return filtered.filter(wallet => !excludedSet.has(wallet.address));

    }, [allWalletsFromContext, isLoadingWallets, excludeWalletAddresses, activeAsset]);

    // Эффект для очистки выбора, если доступные кошельки изменились
    React.useEffect(() => {
        const availableAddressesSet = new Set(availableWallets.map(w => w.address));
        const newSelected = selectedValues.filter(v => availableAddressesSet.has(v));

        if (newSelected.length !== selectedValues.length) {
            setSelectedValues(newSelected);
            // Уведомляем родителя об изменениях
            if (isMultiSelect && onSelectWallets) {
                const selectedObjs = newSelected.map(addr => availableWallets.find(w => w.address === addr)).filter(Boolean) as Wallet[];
                onSelectWallets(selectedObjs);
            } else if (!isMultiSelect && onSelectWallet) {
                const selectedObj = availableWallets.find(w => w.address === newSelected[0]) || null;
                onSelectWallet(selectedObj);
            }
        }
    }, [availableWallets, selectedValues, isMultiSelect, onSelectWallets, onSelectWallet]);


    const handleSelect = (walletToToggle: Wallet) => {
        let newSelectedValues: string[];

        if (isMultiSelect) {
            newSelectedValues = selectedValues.includes(walletToToggle.address)
                ? selectedValues.filter(v => v !== walletToToggle.address)
                : [...selectedValues, walletToToggle.address];
        } else {
            newSelectedValues = [walletToToggle.address];
            setOpen(false); // Закрываем popover при одиночном выборе
        }

        setSelectedValues(newSelectedValues);

        // Вызываем соответствующий колбэк
        if (isMultiSelect && onSelectWallets) {
            const selectedWalletObjects = newSelectedValues
                .map(address => allWalletsFromContext.find(w => w.address === address))
                .filter((w): w is Wallet => !!w);
            onSelectWallets(selectedWalletObjects);
        } else if (!isMultiSelect && onSelectWallet) {
            onSelectWallet(walletToToggle);
        }
    };

    const displayLabel = React.useMemo(() => {
        if (selectedValues.length === 0) return placeholderText;
        if (selectedValues.length === 1) {
            const wallet = allWalletsFromContext.find(w => w.address === selectedValues[0]);
            return wallet?.name || `${selectedValues[0].slice(0, 6)}...${selectedValues[0].slice(-4)}`;
        }
        return `${selectedValues.length} wallets selected`;
    }, [selectedValues, allWalletsFromContext, placeholderText]);

    const buttonDisabled = disabled || isLoadingWallets || !!errorLoadingWallets || (availableWallets.length === 0 && !activeAsset);
    const noWalletsWithAssetText = activeAsset ? `No wallets with ${activeAsset.label}` : "No wallets available";

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger>
                <Button
                    id={id}
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-[350px] justify-between"
                    disabled={buttonDisabled}
                >
                    <span className="truncate">{availableWallets.length === 0 ? noWalletsWithAssetText : displayLabel}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[350px] p-0">
                <Command>
                    <CommandInput placeholder="Search wallet..." />
                    <CommandList>
                        {availableWallets.length === 0 ? (
                            <CommandEmpty>{noWalletsWithAssetText}</CommandEmpty>
                        ) : (
                            <CommandGroup>
                                {availableWallets.map((wallet) => (
                                    <CommandItem
                                        key={wallet.address}
                                        value={wallet.name || wallet.address}
                                        onSelect={() => handleSelect(wallet)}
                                        className="cursor-pointer"
                                    >
                                        {isMultiSelect && (
                                            <Checkbox
                                                checked={selectedValues.includes(wallet.address)}
                                                className="mr-2"
                                            />
                                        )}
                                        <div className="flex justify-between w-full items-center">
                                            <span className="truncate">{wallet.name || `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`}</span>
                                            {/* Отображаем баланс */}
                                            <span className="text-xs text-muted-foreground ml-2">{wallet.balance} KAS</span>
                                        </div>
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