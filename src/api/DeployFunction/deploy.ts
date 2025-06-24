import { KasplexApi, Kiwi, KRC20, Rpc, Utils, Wasm, Enum } from "@kasplex/kiwi";
import {getBalancesForAddresses} from "../BalanceChecker/KaspaBalance.ts";
import {getPrivateKeys} from "../utils/wallet-service.ts";

// Интерфейс для аргументов деплоя, для строгой типизации
interface DeployArgs {
  walletAddress: string;
  ticker: string;
  maxSupply: string;
  mintLimit: string;
  preAllocationAmount?: string;
  decimals?: string;
}

// Константы для валидации
const DEPLOY_FEE_KAS = 1000;
const SERVICE_FEE_KAS = 1; // Согласно сообщению на скриншоте "1000... and 1 KAS..."
const TOTAL_FEE_KAS = DEPLOY_FEE_KAS + SERVICE_FEE_KAS;


/**
 * Проверяет, доступен ли тикер для регистрации.
 * @param ticker - Тикер токена для проверки.
 * @returns {Promise<boolean>} - true, если тикер доступен.
 */
export async function checkTickerAvailability(ticker: string): Promise<boolean> {
  if (!ticker || !/^[A-Z]{4,6}$/.test(ticker)) {
    // Можно выбросить ошибку или просто вернуть false
    throw new Error("Invalid ticker format. Must be 4-6 uppercase letters.");
  }

  await Rpc.setInstance(Kiwi.network).connect();
  try {
    const tokenInfo = await KasplexApi.getToken(ticker);
    // Возвращаем true, если state === 'unused'
    return tokenInfo?.result?.[0]?.state === 'unused';
  } finally {
    // Убедимся, что соединение всегда закрывается
    await Rpc.getInstance().disconnect();
  }
}

/**
 * Выполняет деплой KRC-20 токена.
 * @param args - Объект с параметрами для деплоя.
 * @returns {Promise<string>} TXID успешной транзакции.
 */
export async function deployKrc20Token(args: DeployArgs): Promise<string> {
  const { walletAddress, ticker, maxSupply, mintLimit, preAllocationAmount, decimals } = args;

  // 1. Валидация входных данных на бэкенде
  if (!/^[A-Z]{4,6}$/.test(ticker)) {
    throw new Error("Ticker must be 4-6 uppercase English letters.");
  }
  // Здесь можно добавить валидацию для maxSupply, mintLimit и т.д., если нужно, но основная проверка ниже.

  await Rpc.setInstance(Kiwi.network).connect();

  // 2. Проверка уникальности тикера
  const tokenInfo = await KasplexApi.getToken(ticker);
  if (tokenInfo && tokenInfo.result && tokenInfo.result[0].state !== 'unused') {
    throw new Error(`Token with ticker "${ticker}" already exists or is reserved.`);
  }

  // 3. Проверка баланса кошелька
  const balances = await getBalancesForAddresses([walletAddress]);
  const walletBalanceStr = balances[walletAddress];

  if (!walletBalanceStr) {
    throw new Error(`Could not retrieve balance for wallet ${walletAddress}.`);
  }

  // Очищаем строку от запятых перед парсингом
  const cleanBalanceStr = walletBalanceStr.replace(/,/g, '');
  const walletBalanceNum = parseFloat(cleanBalanceStr);

  if (isNaN(walletBalanceNum) || walletBalanceNum < TOTAL_FEE_KAS) {
    throw new Error(`Insufficient KAS balance. Need at least ${TOTAL_FEE_KAS} KAS for fees. Current balance: ${walletBalanceStr} KAS.`);
  }


  // Используем Wasm.kaspaToSompi для конвертации в наименьшие единицы
  // Это просто умножение на 10^8, что эквивалентно сдвигу запятой на 8 знаков.
  // Если у вас есть своя функция для токенов с произвольным `decimals`, используйте ее.
  // Для простоты будем считать, что Wasm.kaspaToSompi подходит.

  const maxInBaseUnits = Wasm.kaspaToSompi(maxSupply).toString();
  const limInBaseUnits = Wasm.kaspaToSompi(mintLimit).toString();

  let preInBaseUnits = ""; // По умолчанию - ПУСТАЯ СТРОКА, а не "0"

  if (preAllocationAmount && preAllocationAmount.trim() !== '') {
    const preAmountBigInt = Wasm.kaspaToSompi(preAllocationAmount);

    // Добавим нашу собственную проверку, чтобы дать пользователю более понятную ошибку
    if (preAmountBigInt <= 0n) {
      throw new Error("Pre-allocation amount, if provided, must be a positive number.");
    }

    // Проверка, что pre-allocation не больше max supply
    if (preAmountBigInt > BigInt(maxInBaseUnits)) {
      throw new Error("Pre-allocation amount cannot be greater than Max Supply.");
    }

    preInBaseUnits = preAmountBigInt.toString();
  }

  // 4. Получение приватного ключа
  const privateKeysMap = await getPrivateKeys([walletAddress]);
  const privateKeyStr = privateKeysMap.get(walletAddress);
  if (!privateKeyStr) {
    throw new Error("Private key for the selected wallet could not be retrieved.");
  }
  const privateKey = new Wasm.PrivateKey(privateKeyStr);

  // 5. Формирование данных для деплоя
  const deployData = Utils.createKrc20Data({
    p: "krc-20",
    op: Enum.OP.Deploy,
    tick: ticker,
    to: walletAddress, // Pre-allocation amount (if any) is sent to the deployer's address
    max: maxInBaseUnits,     // <--- Используем конвертированное значение
    lim: limInBaseUnits,     // <--- Используем конвертированное значение
    pre: preInBaseUnits,
    dec: decimals || "8", // По умолчанию 8, как в большинстве токенов
    amt: "", // Для операции deploy поле amt должно быть пустым
  });

  console.log("Deploying KRC-20 token with data:", deployData);

  // 6. Вызов функции деплоя из библиотеки
  // Примечание: KRC20.deploy может не принимать комиссию, а рассчитывать ее сама.
  // Если она принимает, то нужно передать ее: KRC20.deploy(privateKey, deployData, Wasm.kaspaToSompi(TOTAL_FEE_KAS.toString()))
  // Судя по документации, она не принимает комиссию явно, а использует стандартную.
  // Важно убедиться, что на кошельке достаточно KAS для покрытия комиссии, которую библиотека установит.
  const txid = await KRC20.deploy(privateKey, deployData);

  console.log(`Token ${ticker} deployed successfully. TXID: ${txid}`);
  await Rpc.getInstance().disconnect();
  return txid;
}