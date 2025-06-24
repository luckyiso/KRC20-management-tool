// src/components/select-fund.tsx
"use client"

import * as React from "react"
import {  ChevronsUpDown } from "lucide-react"

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

// Определяем тип Fund, который будет использоваться в компоненте
export type FundWithIndividualBalances = {
    value: string; // Уникальный идентификатор (e.g., "KAS", "TOKEN_CONTRACT_ADDRESS")
    label: string; // Отображаемое имя (e.g., "Kaspa", "MyToken")
    balance: string; // Общий агрегированный баланс этого актива
    decimals?: number;
    fiatValue?: string;
    individualBalances?: Map<string, string>; // Ключ: адрес кошелька, Значение: баланс в этом кошельке
};

interface SelectFundAllProps {
    id?: string;
    allFunds: FundWithIndividualBalances[]; // <-- Получает все данные от родителя
    onSelectFund: (fund: FundWithIndividualBalances | null) => void; // <-- Сообщает родителю о выборе
    initialSelectedFundValue?: string;
    disabled?: boolean;
    className?: string;
    placeholderText?: string;
}

export function SelectFundAll({
                                  id,
                                  allFunds,
                                  onSelectFund,
                                  initialSelectedFundValue,
                                  disabled,
                                  placeholderText = "Select an asset...",
                              }: SelectFundAllProps) {
    const [open, setOpen] = React.useState(false);
    const [selectedValue, setSelectedValue] = React.useState(initialSelectedFundValue || "");

    // Эффект для синхронизации внутреннего состояния с внешним пропсом
    React.useEffect(() => {
        setSelectedValue(initialSelectedFundValue || "");
    }, [initialSelectedFundValue]);

    // Эффект, который сообщает родительскому компоненту о выборе
    // Он срабатывает, когда меняется selectedValue или сам список фондов
    React.useEffect(() => {
        const selectedFund = allFunds.find(f => f.value === selectedValue) || null;
        onSelectFund(selectedFund);
    }, [selectedValue, allFunds, onSelectFund]);

    const handleSelect = (currentValue: string) => {
        // Если пользователь выбирает уже выбранный элемент, мы можем его сбросить.
        // Или просто установить новое значение. Второй вариант проще.
        setSelectedValue(currentValue);
        setOpen(false); // Закрываем выпадающий список после выбора
    };

    // Используем useMemo для вычисления отображаемого текста, чтобы избежать лишних пересчетов
    const displayLabel = React.useMemo(() => {
        const selectedFund = allFunds.find((fund) => fund.value === selectedValue);
        if (!selectedFund) {
            return placeholderText;
        }
        // Показываем название актива и его общий баланс
        return `${selectedFund.label} (${selectedFund.balance})`;
    }, [selectedValue, allFunds, placeholderText]);

    const isComponentDisabled = disabled || allFunds.length === 0;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger>
                <Button
                    id={id}
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-[350px] justify-between"
                    disabled={isComponentDisabled}
                >
                    <span className="truncate">
                        {isComponentDisabled && allFunds.length === 0 ? "No assets found" : displayLabel}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[350px] p-0">
                <Command>
                    <CommandInput placeholder="Search asset..." />
                    <CommandList>
                        <CommandEmpty>No asset found.</CommandEmpty>
                        <CommandGroup>
                            {allFunds.map((fund) => (
                                <CommandItem
                                    key={fund.value}
                                    value={fund.label} // Поиск будет идти по имени
                                    onSelect={() => handleSelect(fund.value)}
                                    className="cursor-pointer"
                                >
                                    <div className="flex justify-between w-full">
                                        <span>{fund.label}</span>
                                        <span className="text-muted-foreground">{fund.balance}</span>
                                    </div>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}