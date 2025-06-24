    // src/components/select-fund.tsx
    "use client"

    import * as React from "react"
    import { Check, ChevronsUpDown, Loader2 } from "lucide-react"

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

    // Импортируем тип KaspaWalletToken из вашего RPC-сервиса
    // Убедитесь, что путь правильный:
    import { KaspaWalletToken } from "@/api/BalanceChecker/krc20-balance.ts"; // или "@/services/kaspa-tokens"

    // Определяем тип Fund, который будет использоваться в компоненте
    export type Fund = {
        value: string; // Уникальный идентификатор (например, символ токена или адрес контракта)
        label: string; // Отображаемое имя (SOL, KAS, USDC, DIPLOM, ABOBA)
        balance: string; // Баланс монеты/токена (уже форматированный)
        decimals?: number; // Количество десятичных знаков, если нужно для дальнейших операций
        fiatValue?: string; // Опционально: фиатный эквивалент
    };

    interface SelectFundProps {
        walletAddress: string | null; // Адрес выбранного кошелька. Может быть null, если кошелек не выбран.
        onSelectFund?: (fund: Fund | null) => void; // Колбэк при выборе фонда
        initialSelectedFundValue?: string; // Начальное выбранное значение фонда (например, "KAS" или "DIPLOM")
    }

    export function SelectFund({ walletAddress, onSelectFund, initialSelectedFundValue }: SelectFundProps) {
        const [open, setOpen] = React.useState(false);
        const [selectedValue, setSelectedValue] = React.useState(initialSelectedFundValue || "");
        const [funds, setFunds] = React.useState<Fund[]>([]);
        const [isLoadingFunds, setIsLoadingFunds] = React.useState(false);
        const [errorLoadingFunds, setErrorLoadingFunds] = React.useState<string | null>(null);

        // Эффект для загрузки средств, когда меняется walletAddress
        React.useEffect(() => {
            if (!walletAddress) {
                setFunds([]); // Сбрасываем средства, если кошелек не выбран
                setSelectedValue(""); // Сбрасываем выбранное значение
                setErrorLoadingFunds(null);
                setIsLoadingFunds(false);
                if (onSelectFund) {
                    onSelectFund(null); // Сообщаем родителю, что ничего не выбрано
                }
                return;
            }

            const fetchFunds = async () => {
                setIsLoadingFunds(true);
                setErrorLoadingFunds(null);
                setFunds([]); // Очищаем предыдущие данные

                try {
                    // --- ВЫЗЫВАЕМ НОВУЮ IPC-ФУНКЦИЮ ДЛЯ ОДНОГО АДРЕСА ---
                    const allTokensMapObject = await window.electronAPI.getTokensForAddresses([walletAddress]);

                    // Преобразуем полученный объект обратно в Map
                    const allTokensMap = new Map(Object.entries(allTokensMapObject));

                    // Получаем массив токенов конкретно для выбранного кошелька
                    const fetchedKaspaTokens: KaspaWalletToken[] = allTokensMap.get(walletAddress) || [];

                    // Преобразуем KaspaWalletToken[] в Fund[]
                    const formattedFunds: Fund[] = fetchedKaspaTokens.map(token => ({
                        value: token.value,
                        label: token.label,
                        balance: token.balance,
                        decimals: token.decimals,
                        fiatValue: "N/A"
                    }));

                    setFunds(formattedFunds);

                    // Логика выбора начального фонда
                    if (initialSelectedFundValue && formattedFunds.some(f => f.value === initialSelectedFundValue)) {
                        setSelectedValue(initialSelectedFundValue);
                        const selectedFund = formattedFunds.find(f => f.value === initialSelectedFundValue);
                        if (onSelectFund && selectedFund) {
                            onSelectFund(selectedFund);
                        }
                    } else if (formattedFunds.length > 0 && !initialSelectedFundValue) {
                        setSelectedValue(formattedFunds[0].value);
                        if (onSelectFund) {
                            onSelectFund(formattedFunds[0]);
                        }
                    } else {
                        setSelectedValue("");
                        if (onSelectFund) {
                            onSelectFund(null);
                        }
                    }

                } catch (error: any) {
                    console.error("Error fetching funds:", error);
                    setErrorLoadingFunds(`Failed to load funds: ${error.message || String(error)}`);
                    setFunds([]);
                } finally {
                    setIsLoadingFunds(false);
                }
            };

            fetchFunds();

        }, [walletAddress, onSelectFund, initialSelectedFundValue]);

        // Отображаемый текст в кнопке
        const selectedFundLabel = React.useMemo(() => {
            const foundFund = funds.find((fund) => fund.value === selectedValue);
            return foundFund ? `${foundFund.label} (${foundFund.balance})` : "Select fund...";
        }, [selectedValue, funds]);


        return (
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger>
                    <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        className="w-[350px] justify-between"
                        // Отключаем кнопку, если идет загрузка, есть ошибка, нет выбранного кошелька, или нет доступных фондов
                        disabled={isLoadingFunds || errorLoadingFunds !== null || !walletAddress || funds.length === 0}
                    >
                        {isLoadingFunds ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                <span>Loading funds...</span>
                            </>
                        ) : errorLoadingFunds ? (
                            "Error loading funds"
                        ) : (
                            selectedFundLabel
                        )}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[350px] p-0">
                    <Command>
                        <CommandInput placeholder="Search fund..." className="h-9" />
                        <CommandList>
                            {isLoadingFunds ? (
                                <CommandEmpty className="flex items-center justify-center p-4">
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Loading funds...
                                </CommandEmpty>
                            ) : errorLoadingFunds ? (
                                <CommandEmpty className="p-4 text-red-500">Error: {errorLoadingFunds}</CommandEmpty>
                            ) : funds.length === 0 ? (
                                <CommandEmpty className="p-4">No funds found for this wallet.</CommandEmpty>
                            ) : (
                                <CommandGroup>
                                    {funds.map((fund) => (
                                        <CommandItem
                                            key={fund.value}
                                            value={`${fund.label} ${fund.balance}`}
                                            onSelect={(currentValueAsSearchString) => {
                                                const selectedFundByValue = funds.find(f => f.value === fund.value);
                                                if (selectedFundByValue) {
                                                    // Если выбран уже выбранный фонд, сбрасываем его
                                                    if (selectedValue === selectedFundByValue.value) {
                                                        setSelectedValue("");
                                                        if (onSelectFund) {
                                                            onSelectFund(null);
                                                        }
                                                    } else {
                                                        setSelectedValue(selectedFundByValue.value);
                                                        if (onSelectFund) {
                                                            onSelectFund(selectedFundByValue);
                                                        }
                                                    }
                                                    setOpen(false);
                                                }
                                            }}
                                        >
                                            {fund.label} <span className="text-muted-foreground ml-1">{fund.balance}</span>
                                            <Check
                                                className={cn(
                                                    "ml-auto h-4 w-4",
                                                    selectedValue === fund.value ? "opacity-100" : "opacity-0"
                                                )}
                                            />
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