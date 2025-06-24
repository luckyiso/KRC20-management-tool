"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils.ts"
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

interface SelectWalletWithdrawalProps { // Переименовал, чтобы было яснее
    // Опциональный пропс: адрес кошелька, который нужно исключить из списка (например, кошелек-источник)
    excludeWalletAddress?: string | null;
    // Опциональный пропс, если вы хотите получать выбранный кошелек обратно в родительский компонент
    onSelectWallet: (wallet: Wallet | null) => void;
    // Опциональный пропс для начального выбранного кошелька по адресу
    initialSelectedWalletAddress?: string; // Сделал опциональным
}

export function SelectWalletWithdrawal({ excludeWalletAddress, onSelectWallet, initialSelectedWalletAddress }: SelectWalletWithdrawalProps) {
    const { wallets, isLoadingWallets, errorLoadingWallets } = useWallets(1);

    const [open, setOpen] = React.useState(false)
    const [selectedValue, setSelectedValue] = React.useState(initialSelectedWalletAddress || "")

    React.useEffect(() => {
    if (initialSelectedWalletAddress && initialSelectedWalletAddress !== selectedValue) {
        setSelectedValue(initialSelectedWalletAddress);
        // Если initialSelectedWalletAddress изменился и не совпадает с текущим,
        // вызываем onSelectWallet с соответствующим объектом кошелька.
        const walletToSelect = wallets.find(w => w.address === initialSelectedWalletAddress);
        if (walletToSelect) {
            onSelectWallet(walletToSelect);
        }
    }
    // Также, если excludeWalletAddress изменился, и выбранный кошелек теперь исключен,
    // нужно сбросить selectedValue и onSelectWallet(null).
    if (excludeWalletAddress && selectedValue === excludeWalletAddress) {
        setSelectedValue(""); // Сбросить выбор
        onSelectWallet(null); // Сообщить родителю о сбросе
    }
}, [initialSelectedWalletAddress, excludeWalletAddress, wallets, onSelectWallet, selectedValue]);

    const formattedWallets = React.useMemo(() => {
        if (isLoadingWallets || errorLoadingWallets) {
            return [];
        }

        // Применяем фильтрацию по excludeWalletAddress
        const filtered = wallets.filter(wallet =>
            excludeWalletAddress ? wallet.address !== excludeWalletAddress : true
        );

        return filtered.map(wallet => ({
            value: wallet.address,
            label: wallet.name || wallet.address,
            originalWallet: wallet
        }));
    }, [wallets, isLoadingWallets, errorLoadingWallets, excludeWalletAddress]); // Добавили excludeWalletAddress в зависимости

    const selectedWalletLabel = React.useMemo(() => {
        const foundWallet = formattedWallets.find((wallet) => wallet.value === selectedValue);
        return foundWallet ? foundWallet.label : "Select recipient wallet..."; // Изменил текст по умолчанию
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
                                        key={wallet.value} // Используем адрес как ключ
                                        value={wallet.label} // Используем label для поиска в CommandInput (или можно wallet.value)
                                        onSelect={(currentLabel) => {
                                            const found = formattedWallets.find(w => w.label.toLowerCase() === currentLabel.toLowerCase());
                                            if (found) {
                                                setSelectedValue(found.value);
                                                setOpen(false);
                                                onSelectWallet(found.originalWallet); // Вызываем колбэк с выбранным кошельком
                                            } else {
                                                // Если ничего не найдено (может произойти при очистке ввода)
                                                setSelectedValue("");
                                                onSelectWallet(null);
                                            }
                                        }}
                                    >
                                        <Checkbox
                                            // isChecked будет true, если текущий кошелек выбран
                                            checked={selectedValue === wallet.value}
                                            // disabled здесь не нужен, так как выбор происходит через onSelect CommandItem
                                            // onCheckedChange здесь не нужен, так как CommandItem сам обрабатывает выбор
                                            className="mr-2" // Отступ справа от чекбокса
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
