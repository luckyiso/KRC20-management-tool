import {KaspaTransaction, Kiwi, Rpc, Wasm} from "@kasplex/kiwi";


interface TransactionOutput {
  address: string;
  amount: string; // Сумма в Sompi
}

interface TransactionOutputFormatted {
  address: string;
  amount: bigint; // Сумма в Sompi (BigInt)
}

interface TransactionResult {
  senderAddress: string;
  status: 'success' | 'failed';
  txid?: string;
  error?: string;
}

export async function sendKaspaSingleToSingle(
    senderPrivateKey: string,
    recipientDetails: TransactionOutput[],
    feeInSompi: bigint,
): Promise<string> {

  try{
  await Rpc.setInstance(Kiwi.network).connect()
  let privateKey: Wasm.PrivateKey;

  try {
    privateKey = new Wasm.PrivateKey(senderPrivateKey);
  } catch (e) {
    console.error("KaspaTransactionService: Ошибка при создании PrivateKey из строки:", e);
    throw new Error("Неверный формат приватного ключа для транзакции KAS.");
  }

  const recipientOutput = recipientDetails[0];
  const amountInSompi = Wasm.kaspaToSompi(recipientOutput.amount);
    if (typeof amountInSompi !== 'bigint') {
      throw new Error(`Не удалось преобразовать сумму получателя '${recipientOutput.amount}' в Sompi. Проверьте формат.`);
    }
    if (amountInSompi <= 0) {
      throw new Error(`Неверная сумма получателя: ${recipientOutput.amount}. Сумма должна быть положительным числом.`);
    }

    const outputsForTransfer: TransactionOutputFormatted[] = [
      {
        address: recipientOutput.address,
        amount: amountInSompi
      }
    ];

    const txid = await KaspaTransaction.transfer(privateKey, outputsForTransfer, feeInSompi);
    return txid;
  } catch (error: any) {
    console.error(`KaspaTransactionService: Не удалось отправить транзакцию KAS (SingleToSingle): ${error.message || error}`);
    throw new Error(`Не удалось отправить транзакцию KAS (SingleToSingle): ${error.message || "Неизвестная ошибка"}`);
  }
}

// --- 2. Кошелек на Несколько (Один Отправитель, Несколько Получателей) ---
export async function sendKaspaSingleToMultiple(
    senderPrivateKey: string,
    recipientDetails: TransactionOutput[], // Массив входных данных получателей
    feeInSompi: bigint, // Комиссия, предположительно, на одну транзакцию
): Promise<string[]> { // ВАЖНО: Теперь возвращает массив TXID

  if (!senderPrivateKey) {
    throw new Error("Приватный ключ отправителя не может быть пустым.");
  }
  if (!recipientDetails || recipientDetails.length === 0) {
    throw new Error("Не указаны данные получателя для транзакции (SingleToMultiple).");
  }

  const txids: string[] = []; // Массив для хранения всех TXID

  try {
    await Rpc.setInstance(Kiwi.network).connect();
    console.log("KaspaTransactionService: Успешно подключено к RPC.");

    let privateKey: Wasm.PrivateKey;
    try {
      privateKey = new Wasm.PrivateKey(senderPrivateKey);
    } catch (e: any) {
      console.error("KaspaTransactionService: Ошибка при создании PrivateKey из строки:", e.message || e);
      throw new Error("Неверный формат приватного ключа для транзакции KAS.");
    }

    // --- Логика разбиения на партии ---
    const BATCH_SIZE = 2; // Максимальное количество получателей на одну транзакцию

    for (let i = 0; i < recipientDetails.length; i += BATCH_SIZE) {
      const batch = recipientDetails.slice(i, i + BATCH_SIZE);
      const outputsForBatch: TransactionOutputFormatted[] = [];

      for (const detail of batch) {
        const amountInSompi = Wasm.kaspaToSompi(detail.amount);

        if (typeof amountInSompi !== 'bigint') {
          throw new Error(`Не удалось преобразовать сумму получателя '${detail.amount}' (для адреса ${detail.address}) в Sompi. Проверьте формат.`);
        }
        if (amountInSompi <= 0) {
          throw new Error(`Неверная сумма получателя: ${detail.amount} (для адреса ${detail.address}). Сумма должна быть положительным числом.`);
        }

        outputsForBatch.push({
          address: detail.address,
          amount: amountInSompi
        });
      }

      if (outputsForBatch.length === 0) {
        console.warn("KaspaTransactionService: Пропускается пустая партия транзакций.");
        continue;
      }

      try {
        // Вызываем KaspaTransaction.transfer для каждой партии
        // Важно: Комиссия (feeInSompi) здесь применяется к *каждой* транзакции в партии.
        // Если feeInSompi - это общая комиссия, ее нужно будет поделить или пересчитать.
        const batchTxid = await KaspaTransaction.transfer(privateKey, outputsForBatch, feeInSompi);
        txids.push(batchTxid);
        await new Promise(resolve => setTimeout(resolve, 1500));
        console.log(`KaspaTransactionService: Партия KAS транзакций успешно отправлена. TXID: ${batchTxid}`);

        // ОПЦИОНАЛЬНО: Добавьте небольшую задержку между транзакциями, чтобы не перегружать ноду
        // await new Promise(resolve => setTimeout(resolve, 500)); // Задержка 500мс

      } catch (batchError: any) {
        console.error(`KaspaTransactionService: Не удалось отправить партию KAS транзакций (SingleToMultiple) для партии, начинающейся с ${batch[0].address}: ${batchError.message || batchError}`);
        // Здесь можно решить, что делать при ошибке партии:
        // - Пробросить ошибку сразу (как сейчас), прервав все дальнейшие отправки.
        // - Или собрать все ошибки и вернуть их вместе с успешными TXID.
        throw new Error(`Не удалось отправить партию KAS транзакций (SingleToMultiple): ${batchError.message || "Неизвестная ошибка"}`);
      }
    }

    // Возвращаем все успешно отправленные TXID
    return txids;

  } catch (error: any) {
    console.error(`KaspaTransactionService: Не удалось отправить KAS транзакции (SingleToMultiple): ${error.message || error}`);
    throw new Error(`Не удалось отправить KAS транзакции (SingleToMultiple): ${error.message || "Неизвестная ошибка"}`);
  }
}

export async function sendKaspaMultipleToSingle(
    senderAddresses: string[],
    privateKeysMap: Map<string, string>,
    recipientAddress: string,
    amountPerWalletStr: string,
    feeInSompi: bigint,
): Promise<TransactionResult[]> {

  if (!senderAddresses || senderAddresses.length === 0) {
    throw new Error("Необходимо указать хотя бы один адрес отправителя.");
  }
  if (!recipientAddress || !amountPerWalletStr) {
    throw new Error("Не указан адрес получателя или сумма для отправки.");
  }

  await Rpc.setInstance(Kiwi.network).connect();

  const amountPerWalletInSompi = Wasm.kaspaToSompi(amountPerWalletStr);
  if (typeof amountPerWalletInSompi !== 'bigint' || amountPerWalletInSompi <= 0) {
    throw new Error(`Неверная сумма для отправки с каждого кошелька: ${amountPerWalletStr}`);
  }

  // Создаем массив промисов (задач) для каждой транзакции
  const transactionPromises = senderAddresses.map(async (senderAddress): Promise<TransactionResult> => {
    const senderPrivateKey = privateKeysMap.get(senderAddress);
    if (!senderPrivateKey) {
      return {
        senderAddress,
        status: 'failed',
        error: 'Приватный ключ не найден.'
      };
    }

    try {

      // Используем вашу стандартную функцию `transfer`
      const privateKey = new Wasm.PrivateKey(senderPrivateKey);
      const recipientDetails = [{ address: recipientAddress, amount: amountPerWalletInSompi }]; // Сумма уже в Sompi

      // Предполагаем, что transfer принимает amount в bigint. Если нет, нужно адаптировать.
      const txid = await KaspaTransaction.transfer(privateKey, recipientDetails, feeInSompi);

      console.log(`Успешно отправлено ${amountPerWalletStr} KAS с ${senderAddress}. TXID: ${txid}`);
      return {
        senderAddress,
        status: 'success',
        txid: txid
      };

    } catch (error: any) {
      console.error(`Ошибка при отправке с ${senderAddress}: ${error.message}`);
      return {
        senderAddress,
        status: 'failed',
        error: error.message || 'Неизвестная ошибка транзакции.'
      };
    }
  });

  // Ожидаем выполнения всех транзакций параллельно
  return Promise.all(transactionPromises);
}