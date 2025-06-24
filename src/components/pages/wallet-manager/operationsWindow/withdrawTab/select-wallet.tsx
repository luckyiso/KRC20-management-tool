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
    // Если вам нужно фильтровать кошельки (например, только для вывода, или только обычные)
    filterWalletsBy?: 0;
    // Опциональный пропс, если вы хотите получать выбранный кошелек обратно в родительский компонент
    onSelectWallet?: (wallet: Wallet | null) => void;
    // Опциональный пропс для начального выбранного кошелька
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
            return []; // Или можно вернуть заглушку, например, { value: "loading", label: "Loading wallets..." }
        }
        if (errorLoadingWallets) {
            console.error("Error loading wallets for SelectWallet:", errorLoadingWallets);
            return []; // Или вернуть ошибку, например, { value: "error", label: "Error loading wallets" }
        }
        return wallets.map(wallet => ({
            value: wallet.address, // Используем адрес как уникальное значение
            label: wallet.name || wallet.address, // Отображаем имя, если есть, иначе адрес
            originalWallet: wallet // Сохраняем весь объект кошелька для onSelectWallet
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
                                        key={wallet.value} // Используем адрес как ключ
                                        value={wallet.label} // Используем label для поиска в CommandInput (или можно wallet.value)
                                        onSelect={(currentLabel) => {
                                            // Находим кошелек по label, который был выбран
                                            const found = formattedWallets.find(w => w.label.toLowerCase() === currentLabel.toLowerCase());
                                            if (found) {
                                                setSelectedValue(found.value); // Устанавливаем адрес
                                                setOpen(false); // Закрываем Popover
                                                if (onSelectWallet) {
                                                    onSelectWallet(found.originalWallet); // Вызываем колбэк с выбранным кошельком
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
