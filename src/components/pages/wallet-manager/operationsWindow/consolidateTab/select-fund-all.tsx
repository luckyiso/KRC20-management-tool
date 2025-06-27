
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

export type FundWithIndividualBalances = {
    value: string;
    label: string;
    balance: string;
    decimals?: number;
    fiatValue?: string;
    individualBalances?: Map<string, string>;
};

interface SelectFundAllProps {
    id?: string;
    allFunds: FundWithIndividualBalances[];
    onSelectFund: (fund: FundWithIndividualBalances | null) => void;
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

    React.useEffect(() => {
        setSelectedValue(initialSelectedFundValue || "");
    }, [initialSelectedFundValue]);

    React.useEffect(() => {
        const selectedFund = allFunds.find(f => f.value === selectedValue) || null;
        onSelectFund(selectedFund);
    }, [selectedValue, allFunds, onSelectFund]);

    const handleSelect = (currentValue: string) => {
        setSelectedValue(currentValue);
        setOpen(false);
    };

    const displayLabel = React.useMemo(() => {
        const selectedFund = allFunds.find((fund) => fund.value === selectedValue);
        if (!selectedFund) {
            return placeholderText;
        }
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
                                    value={fund.label}
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