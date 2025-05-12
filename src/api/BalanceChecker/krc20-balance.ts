import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path'; // Для более надежной работы с путями к файлам
import minimist from 'minimist'; // Для аргументов командной строки
import pLimit from 'p-limit'; // Для ограничения конкурентности

// Интерфейс для токена, возвращаемого API Kasplex
interface IKasplexToken {
    tick: string;
    balance: string; // API возвращает баланс как строку (может быть большим числом)
    dec: number;    // Количество десятичных знаков
    supply: string;
    max_supply: string | null;
    limit: string;
    mint_limit: string;
    status: number;
    transactions: number;
    holders: number;
}

// Интерфейс для ответа API Kasplex со списком токенов адреса
interface IKasplexAddressTokenListResponse {
    result: IKasplexToken[];
    // Могут быть другие поля, если API возвращает их
}

// Интерфейс для структурированного хранения данных по адресу
interface IAddressTokenData {
    address: string;
    tokens: Array<{
        tick: string;
        balance: bigint; // Используем BigInt для точного хранения баланса
        decimals: number;
    }>;
}

class TokenBalanceChecker {
    private apiBaseUrl: string;
    // Храним итоговые суммы как BigInt, вместе с количеством десятичных знаков для каждого тикера
    private totals: Map<string, { total: bigint, decimals: number }>;
    // Храним структурированные данные по каждому адресу
    private results: IAddressTokenData[];
    private concurrencyLimit: number; // Максимальное количество одновременных запросов

    constructor(apiBaseUrl: string = 'https://tn10api.kasplex.org/v1/krc20', concurrencyLimit: number = 5) {
        this.apiBaseUrl = apiBaseUrl;
        this.totals = new Map<string, { total: bigint, decimals: number }>();
        this.results = [];
        this.concurrencyLimit = concurrencyLimit;
    }

    // Получение данных о токенах для адреса с лучшей обработкой ошибок Axios
    private async fetchTokenData(address: string): Promise<IKasplexAddressTokenListResponse | null> {
        const url = `${this.apiBaseUrl}/address/${address}/tokenlist`;
        try {
            console.log(`Workspaceing data for address: ${address}...`);
            const response = await axios.get<IKasplexAddressTokenListResponse>(url);
            console.log(`Successfully fetched data for address: ${address}`);
            return response.data;
        } catch (error: any) {
            // Улучшенное логирование ошибки Axios
            if (axios.isAxiosError(error)) {
                console.error(`Error fetching data for address ${address} from ${url}:`, {
                    message: error.message,
                    status: error.response?.status,
                    statusText: error.response?.statusText,
                    data: error.response?.data,
                    // request: error.request, // Может быть слишком много данных
                    // config: error.config, // Может быть слишком много данных
                });
            } else {
                console.error(`Unexpected error fetching data for address ${address} from ${url}:`, error);
            }
            // Не пробрасываем ошибку, чтобы обработка других адресов продолжилась
            return null; // Возвращаем null при ошибке
        }
    }

    // Чтение адресов из файла
    public readAddresses(filePath: string): string[] {
        try {
            const data = fs.readFileSync(filePath, 'utf8');
            const lines = data.split('\n').map(line => line.trim());
            const addresses = lines
                .filter(line => line.startsWith('Receive Address:'))
                .map(line => line.replace('Receive Address: ', '').trim())
                .filter(address => address.length > 0); // Фильтруем пустые строки после обработки
            console.log(`Read ${addresses.length} addresses from ${filePath}`);
            return addresses;
        } catch (error) {
            console.error(`Error reading addresses file ${filePath}:`, error);
            throw error; // Пробрасываем ошибку чтения файла, т.к. без адресов работать нельзя
        }
    }

    // Форматирование числа BigInt с учетом десятичных знаков
    private formatBigIntBalance(amount: bigint, decimals: number): string {
        if (decimals === 0) {
            return amount.toString();
        }

        const amountStr = amount.toString();
        const integerPart = amountStr.slice(0, -decimals) || '0';
        const fractionalPart = amountStr.slice(-decimals).padStart(decimals, '0');

        // Округление и форматирование десятичной части, как toFixed
        // Это упрощенный вариант, можно использовать библиотеку для более точного округления BigInt
        const formattedFractional = fractionalPart.padEnd(2, '0').slice(0, 2); // До 2 знаков после запятой

        // Проверка на необходимость дробной части
        if (Number(fractionalPart) === 0) { // Если дробная часть состоит только из нулей
            return integerPart;
        }


        return `${integerPart}.${formattedFractional}`;

        /* // Более сложный вариант для toFixed(2) с округлением:
        const divisor = 10n ** BigInt(decimals);
        const amountInBase = amount;

        // Для toFixed(2), нам нужно рассмотреть 2 знака после запятой.
        // Умножим число на 10^2, чтобы сдвинуть нужные знаки
        const scaledAmount = amountInBase * 100n; // 10^2

        // Разделим на делитель, чтобы получить число в формате X.YY
        const scaledIntegerPart = scaledAmount / divisor;
        const scaledFractionalPart = scaledAmount % divisor;

        // Получим два знака после запятой и выполним округление по третьему знаку
        const roundedFractional = (scaledFractionalPart.toString().padStart(decimals + 2, '0')).slice(-decimals - 2);
        const fractionalPartToUse = roundedFractional.slice(0, 2);
        const roundingDigit = parseInt(roundedFractional.slice(2, 3) || '0', 10);

        let finalInteger = scaledIntegerPart;
        let finalFractional = fractionalPartToUse;

        if (roundingDigit >= 5) {
             // Нужна логика округления вверх
             // Это усложняет, т.к. нужно обрабатывать перенос разряда.
             // Вернемся к более простому срезанию для примера.
        }

        // Простой формат без округления
        const finalFractionalSimple = fractionalPart.padEnd(2, '0').slice(0, 2);
         if (Number(finalFractionalSimple) === 0) {
             return integerPart;
         }
        return `${integerPart}.${finalFractionalSimple}`;
        */
    }


    // Обновление итоговых сумм (используем BigInt)
    private updateTotals(tick: string, amount: bigint, decimals: number): void {
        if (this.totals.has(tick)) {
            const currentTotal = this.totals.get(tick)!;
            // Проверяем, что decimals для одного тикера не меняются (должны быть константными)
            if (currentTotal.decimals !== decimals) {
                console.warn(`Warning: Decimals mismatch for token ${tick}. Using ${currentTotal.decimals}.`);
            }
            this.totals.set(tick, { total: currentTotal.total + amount, decimals: currentTotal.decimals });
        } else {
            this.totals.set(tick, { total: amount, decimals: decimals });
        }
    }

    // Обработка данных адреса
    private async processAddress(address: string): Promise<void> {
        const data = await this.fetchTokenData(address);

        if (!data || !data.result) {
            // fetchTokenData уже логировал ошибку, просто пропускаем этот адрес
            console.log(`Skipping processing for address ${address} due to fetch error.`);
            return;
        }

        const addressTokenData: IAddressTokenData = {
            address: address,
            tokens: []
        };

        data.result.forEach((token: IKasplexToken) => {
            try {
                // Используем BigInt для баланса
                const balanceBigInt = BigInt(token.balance);
                const decimals = Number(token.dec); // Decimals обычно не очень большие, Number подходит

                addressTokenData.tokens.push({
                    tick: token.tick,
                    balance: balanceBigInt,
                    decimals: decimals
                });

                // Обновляем итоги с BigInt балансом
                this.updateTotals(token.tick, balanceBigInt, decimals);

            } catch (parseError) {
                console.error(`Error parsing token data for address ${address}, token ${token.tick}:`, parseError);
                // Продолжаем обработку других токенов для этого адреса
            }
        });

        this.results.push(addressTokenData); // Сохраняем структурированные данные
    }

    // Вывод таблицы
    private printResults(): void {
        console.log("\n--- KRC20 Token Balances ---");
        console.log("Address".padEnd(50) + "Tokens");
        console.log("-".repeat(80));

        this.results.forEach(addressData => {
            const tokensFormatted = addressData.tokens.map(token =>
                // Форматируем BigInt баланс для вывода
                `${token.tick}: ${this.formatBigIntBalance(token.balance, token.decimals)}`
            ).join(" | ");
            console.log(addressData.address.padEnd(50) + tokensFormatted);
        });

        console.log("\n--- Totals ---");
        // Перебираем итоги и форматируем их BigInt балансы для вывода
        this.totals.forEach((data, tick) => {
            console.log(`${tick}: ${this.formatBigIntBalance(data.total, data.decimals)}`);
        });
        console.log("--------------");
    }

    // Основной публичный метод
    public async checkAndDisplayBalances(filePath: string): Promise<void> {
        const absoluteFilePath = path.resolve(filePath); // Получаем абсолютный путь

        if (!fs.existsSync(absoluteFilePath)) {
            throw new Error(`The specified addresses file does not exist: ${absoluteFilePath}`);
        }

        const addresses = this.readAddresses(absoluteFilePath);

        if (addresses.length === 0) {
            console.log("No addresses found in the file.");
            return;
        }

        // ### Используем p-limit для ограниченной конкурентности ###
        const limit = pLimit(this.concurrencyLimit); // Создаем ограничитель
        console.log(`Starting to process ${addresses.length} addresses with concurrency limit of ${this.concurrencyLimit}...`);

        // Создаем массив промисов, обернутых в limit
        const processingPromises = addresses.map(address =>
            limit(() => this.processAddress(address)) // Каждая функция, переданная в limit, возвращает промис
        );

        // Ждем завершения всех промисов
        await Promise.all(processingPromises);
        // #####################################################

        this.printResults();
    }
}

// Пример использования с аргументами командной строки
async function main() {
    const args = minimist(process.argv.slice(2));

    const apiBaseUrl = args['api-url'] || 'https://tn10api.kasplex.org/v1/krc20'; // URL API из аргументов или по умолчанию
    const filePath = args['file'] || 'E:\\KRC20-management-tool\\src\\api\\BalanceChecker\\wallets.txt'; // Путь к файлу из аргументов или по умолчанию
    const concurrency = Number(args['concurrency']) || 5; // Уровень конкурентности из аргументов или по умолчанию

    console.log(`Using API URL: ${apiBaseUrl}`);
    console.log(`Reading addresses from: ${filePath}`);
    console.log(`Concurrency limit: ${concurrency}`);


    try {
        // Передаем уровень конкурентности в конструктор
        const checker = new TokenBalanceChecker(apiBaseUrl, concurrency);
        await checker.checkAndDisplayBalances(filePath);
    } catch (error) {
        console.error('Fatal Error:', error);
    }
}

main();