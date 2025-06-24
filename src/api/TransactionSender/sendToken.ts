import {Enum, Kiwi, KRC20, Rpc, Utils, Wasm} from "@kasplex/kiwi";


interface TransactionOutput {
  address: string;
  amount: string; // Сумма в Sompi
}

interface TransactionResult {
  senderAddress: string;
  status: 'success' | 'failed';
  txid?: string;
  error?: string;
}

export async function sendTokenSingleToSingle(
    senderPrivateKey: string,
    recipientDetails: TransactionOutput[],
    feeInSompi: bigint,
    ticker: string, // <-- НОВЫЙ ПАРАМЕТР
): Promise<string> {
  if (!ticker) {
    throw new Error("Не указан тикер токена для отправки.");
  }
  if (!recipientDetails || !recipientDetails[0]) {
    throw new Error("Не указаны данные получателя.");
  }

  try {
    await Rpc.setInstance(Kiwi.network).connect();
    let privateKey: Wasm.PrivateKey;

    try {
      privateKey = new Wasm.PrivateKey(senderPrivateKey);
    } catch (e) {
      console.error("KaspaTransactionService: Ошибка при создании PrivateKey из строки:", e);
      throw new Error("Неверный формат приватного ключа для транзакции KAS.");
    }

    const recipient = recipientDetails[0];

    const amountInSmallestUnit = Wasm.kaspaToSompi(recipient.amount);
    if (typeof amountInSmallestUnit !== 'bigint' || amountInSmallestUnit <= 0) {
      throw new Error(`Неверная или нулевая сумма токена: ${recipient.amount}`);
    }

    const krc20data = Utils.createKrc20Data({
      p: "krc-20",
      op: Enum.OP.Transfer,
      tick: ticker,
      to: recipient.address,
      amt: amountInSmallestUnit.toString(), // Сумма токенов, не Sompi!
    });

    console.log(`Подготовка к отправке токена ${ticker}. Данные:`, krc20data);

    // Используем специальную функцию для отправки токенов
    const txid = await KRC20.transfer(privateKey, krc20data, feeInSompi);

    console.log(`Транзакция токена ${ticker} успешно отправлена. TXID: ${txid}`);
    return txid;
  } catch (error: any) {
    console.error(`Service: Не удалось отправить токен ${ticker} (SingleToSingle): ${error.message || error}`);
    throw error; // Пробрасываем ошибку выше
  }
}

// --- 2. Кошелек на Несколько (Один Отправитель, Несколько Получателей) ---
export async function sendTokenSingleToMultiple(
    senderPrivateKey: string,
    recipientDetails: TransactionOutput[],
    feeInSompi: bigint,
    ticker: string, // <-- НОВЫЙ ПАРАМЕТР
): Promise<string[]> {
  if (!ticker) {
    throw new Error("Не указан тикер токена для отправки.");
  }
  if (!recipientDetails || recipientDetails.length === 0) {
    throw new Error("Не указаны данные получателей.");
  }

  await Rpc.setInstance(Kiwi.network).connect();

  let privateKey: Wasm.PrivateKey;
  try {
    privateKey = new Wasm.PrivateKey(senderPrivateKey);
  } catch (e) {
    console.error("KaspaTransactionService: Ошибка при создании PrivateKey из строки:", e);
    throw new Error("Неверный формат приватного ключа для транзакции KAS.");
  }
  const createdTxids: string[] = [];

  // Итерируемся по каждому получателю и создаем для него отдельную транзакцию
  for (const recipient of recipientDetails) {
    try {

      const amountInSmallestUnit = Wasm.kaspaToSompi(recipient.amount);
      if (typeof amountInSmallestUnit !== 'bigint' || amountInSmallestUnit <= 0) {
        console.error(`Неверная сумма токена для ${recipient.address}: ${recipient.amount}. Пропускаем.`);
        continue;
      }

      const krc20data = Utils.createKrc20Data({
        p: "krc-20",
        op: Enum.OP.Transfer,
        tick: ticker,
        to: recipient.address,
        amt: amountInSmallestUnit.toString(),
      });

      console.log(`Отправка ${recipient.amount} ${ticker} на адрес ${recipient.address}...`);

      const txid = await KRC20.transfer(privateKey, krc20data, feeInSompi);
      createdTxids.push(txid);
      console.log(`Успешно. TXID: ${txid}`);

      // Небольшая пауза, чтобы не перегружать ноду
      await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error: any) {
      console.error(`Service: Не удалось отправить токен ${ticker} на адрес ${recipient.address}: ${error.message}`);
      // В случае ошибки с одним получателем, мы прерываем всю операцию.
      // Можно изменить логику, чтобы собрать ошибки и продолжить.
      throw new Error(`Ошибка при отправке на ${recipient.address}: ${error.message}`);
    }
  }
  return createdTxids;
}

export async function sendTokenMultipleToSingle(
    senderAddresses: string[],
    privateKeysMap: Map<string, string>,
    recipientAddress: string,
    amountPerWalletStr: string,
    feeInSompi: bigint,
    ticker: string, // <-- НОВЫЙ ПАРАМЕТР
): Promise<TransactionResult[]> {
  if (!ticker) {
    throw new Error("Не указан тикер токена для отправки.");
  }
  if (!senderAddresses || senderAddresses.length === 0) {
    throw new Error("Необходимо указать хотя бы один адрес отправителя.");
  }
  if (!recipientAddress || !amountPerWalletStr) {
    throw new Error("Не указан адрес получателя или сумма для отправки.");
  }

  await Rpc.setInstance(Kiwi.network).connect();

  const amountInSmallestUnit = Wasm.kaspaToSompi(amountPerWalletStr);
  if (typeof amountInSmallestUnit !== 'bigint' || amountInSmallestUnit <= 0) {
    throw new Error(`Неверная или нулевая сумма токена для отправки с каждого кошелька: ${amountPerWalletStr}`);
  }
  const amountToSendStr = amountInSmallestUnit.toString();

  const transactionPromises = senderAddresses.map(async (senderAddress): Promise<TransactionResult> => {

    const senderPrivateKey = privateKeysMap.get(senderAddress);

    if (!senderPrivateKey) {
      return { senderAddress, status: 'failed', error: 'Приватный ключ не найден.' };
    }

    let privateKey: Wasm.PrivateKey;
    try {
      privateKey = new Wasm.PrivateKey(senderPrivateKey);
    } catch (e) {
      console.error("KaspaTransactionService: Ошибка при создании PrivateKey из строки:", e);
      throw new Error("Неверный формат приватного ключа для транзакции KAS.");
    }

    try {
      const krc20data = Utils.createKrc20Data({
        p: "krc-20",
        op: Enum.OP.Transfer,
        tick: ticker,
        to: recipientAddress,
        amt: amountToSendStr,
      });

      const txid = await KRC20.transfer(privateKey, krc20data, feeInSompi);

      console.log(`Успешно отправлено ${amountPerWalletStr} ${ticker} с ${senderAddress}. TXID: ${txid}`);
      return { senderAddress, status: 'success', txid: txid };

    } catch (error: any) {
      console.error(`Ошибка при отправке токена с ${senderAddress}: ${error.message}`);
      return { senderAddress, status: 'failed', error: error.message || 'Неизвестная ошибка.' };
    }
  });

  return Promise.all(transactionPromises);
}