import {KaspaTransaction, Kiwi, Rpc, Wasm} from "@kasplex/kiwi";


interface TransactionOutput {
  address: string;
  amount: string;
}

interface TransactionOutputFormatted {
  address: string;
  amount: bigint;
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
    if (typeof amountInSompi !== 'bigint' || amountInSompi <= 0n) {
      throw new Error(`Не удалось преобразовать сумму получателя '${recipientOutput.amount}' или она не является положительной.`);
    }

    const outputsForTransfer: TransactionOutputFormatted[] = [
      {
        address: recipientOutput.address,
        amount: amountInSompi
      }
    ];

    const txid = await KaspaTransaction.transfer(privateKey, outputsForTransfer, feeInSompi);
    if (!txid) {
      throw new Error("Транзакция не удалась, ID не был возвращен.");
    }
    return txid;
  } catch (error: any) {
    console.error(`KaspaTransactionService: Не удалось отправить транзакцию KAS (SingleToSingle): ${error.message || error}`);
    throw new Error(`Не удалось отправить транзакцию KAS (SingleToSingle): ${error.message || "Неизвестная ошибка"}`);
  }
}

// --- 2. Кошелек на Несколько (Один Отправитель, Несколько Получателей) ---
export async function sendKaspaSingleToMultiple(
    senderPrivateKey: string,
    recipientDetails: TransactionOutput[],
    feeInSompi: bigint,
): Promise<string[]> {

  if (!senderPrivateKey) {
    throw new Error("Приватный ключ отправителя не может быть пустым.");
  }
  if (!recipientDetails || recipientDetails.length === 0) {
    throw new Error("Не указаны данные получателя для транзакции (SingleToMultiple).");
  }

  const txids: string[] = [];

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

    const BATCH_SIZE = 2;

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
        const batchTxid = await KaspaTransaction.transfer(privateKey, outputsForBatch, feeInSompi);
        if (batchTxid) {
          txids.push(batchTxid);
          console.log(`KaspaTransactionService: Партия KAS транзакций успешно отправлена. TXID: ${batchTxid}`);
        } else {
          throw new Error(`Не удалось получить ID транзакции для партии, начинающейся с ${batch[0].address}`);
        }
        await new Promise(resolve => setTimeout(resolve, 1500));
        console.log(`KaspaTransactionService: Партия KAS транзакций успешно отправлена. TXID: ${batchTxid}`);

      } catch (batchError: any) {
        console.error(`KaspaTransactionService: Не удалось отправить партию KAS транзакций (SingleToMultiple) для партии, начинающейся с ${batch[0].address}: ${batchError.message || batchError}`);
        throw new Error(`Не удалось отправить партию KAS транзакций (SingleToMultiple): ${batchError.message || "Неизвестная ошибка"}`);
      }
    }

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

      const privateKey = new Wasm.PrivateKey(senderPrivateKey);
      const recipientDetails = [{ address: recipientAddress, amount: amountPerWalletInSompi }];

      const txid = await KaspaTransaction.transfer(privateKey, recipientDetails, feeInSompi);
      if (!txid) {
        throw new Error("Transaction failed, no TXID returned.");
      }
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
  return Promise.all(transactionPromises);
}