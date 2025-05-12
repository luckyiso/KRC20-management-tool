import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { RpcClient, Encoding, Resolver, ScriptBuilder, Opcodes, PrivateKey, addressFromScriptPublicKey, createTransactions, kaspaToSompi, UtxoProcessor, UtxoContext } = require ("../../../wasm/kaspa");
import minimist from 'minimist';

// Parse command-line arguments
const args = minimist(process.argv.slice(2));
const privateKeyArg = args.privKey;
const network = args.network || 'testnet-10';
const ticker = args.ticker || 'TCHIMP';
const priorityFeeValue = args.priorityFee || '0';
const timeout = args.timeout || 300000; // 5 minutes timeout
const logLevel = args.logLevel || 'INFO';
const loops = args.loops || 1;

// Эти переменные используются в текущей логике ожидания через событие.
// Мы изменим логику ожидания, но оставим их, если подписка на события все еще нужна для отладки.
let addedEventTrxId : any;
let SubmittedtrxId: any;

if (!privateKeyArg) {
  console.error("Please provide a private key using the --privKey flag.");
  process.exit(1);
}

log("Main: starting rpc connection", 'DEBUG');
const RPC = new RpcClient({
  resolver: new Resolver(),
  encoding: Encoding.Borsh,
  networkId: network
});

await RPC.disconnect();
await RPC.connect();
log("Main: RPC connection established", 'DEBUG');

function log(message: string, level: string = 'INFO') {
  const timestamp = new Date().toISOString();
  if (level === 'ERROR') {
    console.error(`[${timestamp}] [${level}] ${message}`);
  } else if (logLevel === 'DEBUG' || level === 'INFO') {
    console.log(`[${timestamp}] [${level}] ${message}`);
  }
}

function printResolverUrls(rpcClient: RpcClient) {
  const resolver = rpcClient.resolver;
  if (resolver && resolver.urls) {
    log("Resolver URLs:", 'DEBUG');
    resolver.urls.forEach((url: string) => {
      log(url, 'DEBUG');
    });
  } else {
    log("No URLs found in the Resolver.", 'DEBUG');
  }
}

// Display info about the used URLs if log level is DEBUG
if (logLevel === 'DEBUG') {
  printResolverUrls(RPC);
}

log(`Main: Submitting private key`, 'DEBUG');
const privateKey = new PrivateKey(privateKeyArg);
log(`Main: Determining public key`, 'DEBUG');
const publicKey = privateKey.toPublicKey();
log(`Main: Determining wallet address`, 'DEBUG');
const address = publicKey.toAddress(network);
log(`Address: ${address.toString()}`, 'INFO');

// UTXO subscription setup:
log(`Subscribing to UTXO changes for address: ${address.toString()}`, 'DEBUG');
await RPC.subscribeUtxosChanged([address.toString()]);
// Возможно, стоит подписаться и на P2SH адрес, чтобы видеть добавление UTXO там быстрее.
// await RPC.subscribeUtxosChanged([address.toString(), P2SHAddress.toString()]);
// Но для надежного ожидания лучше поллинг getUtxosByAddresses.


// Обработчик событий. Оставляем его для обновления addedEventTrxId и eventReceived
// Но основная логика ожидания теперь будет через поллинг getUtxosByAddresses
RPC.addEventListener('utxos-changed', async (event: any) => {
  log(`UTXO changes detected for address: ${address.toString()}`, 'DEBUG');
  // В этой логике eventReceived устанавливается только при добавлении UTXO на основной адрес с ID, равным SubmittedtrxId.
  // Это полезно для ожидания Commit транзакции, но не для Reveal.
  const addedEntry = event.data.added.find((entry: any) =>
      entry.address.payload === address.toString().split(':')[1]
  );
  if (addedEntry) {
    addedEventTrxId = addedEntry.outpoint.transactionId;
    log(`Added UTXO TransactionId for main address: ${addedEventTrxId}`, 'DEBUG');
    if (addedEventTrxId == SubmittedtrxId) { // SubmittedtrxId должен быть установлен в хэш Commit транзакции перед этим ожиданием
    }
  }

  // Для Reveal транзакции важнее удаленные UTXO
  const removedEntries = event.data.removed.filter((entry: any) =>
      entry.address.payload === address.toString().split(':')[1] ||
      // Если подписались и на P2SH
      (P2SHAddress && entry.address.payload === P2SHAddress.toString().split(':')[1])
  );

  if(removedEntries.length > 0) {
    log(`Removed UTXO(s) detected for relevant addresses: ${JSON.stringify(removedEntries, (key, value) => typeof value === 'bigint' ? value.toString() + 'n' : value)}`, 'DEBUG');
    // В более сложной логике здесь можно отслеживать, какие из отправленных транзакций подтвердились
  }
});


const gasFee = 1
const data = { "p": "krc-20", "op": "mint", "tick": ticker };
log(`Main: Data to use for ScriptBuilder: ${JSON.stringify(data)}`, 'DEBUG');

const script = new ScriptBuilder()
    .addData(publicKey.toXOnlyPublicKey().toString())
    .addOp(Opcodes.OpCheckSig)
    .addOp(Opcodes.OpFalse)
    .addOp(Opcodes.OpIf)
    .addData(Buffer.from("kasplex"))
    .addI64(0n)
    .addData(Buffer.from(JSON.stringify(data, null, 0)))
    .addOp(Opcodes.OpEndIf);

const P2SHAddress = addressFromScriptPublicKey(script.createPayToScriptHashScript(), network)!;


if (logLevel === 'DEBUG') {
  log(`Constructed Script: ${script.toString()}`, 'DEBUG');
  log(`P2SH Address: ${P2SHAddress.toString()}`, 'DEBUG');
}

// Массив для хранения UTXO, использованных в предыдущей Reveal транзакции, чтобы дождаться их исчезновения
let inputsUsedInPreviousReveal: { outpoint: { transactionId: string, index: number } }[] = [];

for (let i = 0; i < loops; i++) {
  log(`Starting loop iteration ${i + 1} of ${loops}`, 'INFO');

  try {
    // --- НАЧАЛО: Ожидание подтверждения Reveal транзакции из ПРЕДЫДУЩЕЙ итерации ---
    // Этот блок выполняется только со 2-й и последующих итераций
    if (i > 0 && inputsUsedInPreviousReveal.length > 0) {
      log(`Main: Waiting for confirmation of reveal transaction from previous loop iteration...`, 'INFO');
      let previousRevealConfirmed = false;
      const revealConfirmTimeout = setTimeout(() => {
        if (!previousRevealConfirmed) {
          log('Timeout: Reveal transaction from previous loop did not confirm', 'ERROR');
          // Если транзакция не подтвердилась за таймаут, это проблема.
          // Решите, стоит ли продолжать (риск ошибок) или завершить выполнение.
          // Для надежности лучше завершить:
          process.exit(1);
        }
      }, timeout); // Используем общий таймаут для ожидания подтверждения

      while (!previousRevealConfirmed) {
        // Поллинг доступных UTXO каждые X миллисекунд
        await new Promise(resolve => setTimeout(resolve, 50)); // Частота опроса: 500ms

        try {
          // Получаем актуальный список UTXO для основного и P2SH адресов
          const { entries: currentUtxosMain } = await RPC.getUtxosByAddresses({ addresses: [address.toString()] });
          const { entries: currentUtxosP2SH } = await RPC.getUtxosByAddresses({ addresses: [P2SHAddress.toString()] });
          const currentUtxos = [...currentUtxosMain, ...currentUtxosP2SH];

          // Проверяем, исчезли ли ВСЕ UTXO, которые были использованы в предыдущей Reveal транзакции
          const allInputsRemoved = inputsUsedInPreviousReveal.every(spentInput =>
              !currentUtxos.some(currentUtxo =>
                  // Сравниваем Outpoint (ID транзакции и индекс выхода)
                  currentUtxo.entry.outpoint.transactionId === spentInput.outpoint.transactionId &&
                  currentUtxo.entry.outpoint.index === spentInput.outpoint.index
              )
          );

          if (allInputsRemoved) {
            log(`Main: Reveal transaction from previous loop confirmed (inputs disappeared).`, 'INFO');
            previousRevealConfirmed = true;
          } else {
            log(`Main: Still waiting for inputs from previous reveal tx to disappear...`, 'DEBUG');
          }

        } catch (fetchError) {
          log(`Error fetching UTXOs during reveal confirmation wait: ${fetchError}`, 'ERROR');
          // Ошибка при получении UTXO - это серьезно. Лучше завершить выполнение.
          process.exit(1);
        }
      }
      clearTimeout(revealConfirmTimeout);
      // Очищаем список использованных входов для следующей итерации
      inputsUsedInPreviousReveal = [];
      log(`Main: Previous loop's reveal transaction confirmed. Proceeding to next iteration's commit.`, 'INFO');
    }
    // --- КОНЕЦ: Ожидание подтверждения Reveal транзакции из ПРЕДЫДУЩЕЙ итерации ---


    // --- НАЧАЛО: Commit Transaction Part ---
    // Получаем актуальный список UTXO основного адреса ПОСЛЕ ожидания подтверждения предыдущей транзакции
    const { entries } = await RPC.getUtxosByAddresses({ addresses: [address.toString()] });
    log(`Main: Fetched available UTXOs for commit transaction.`, 'DEBUG');


    // Создаем Commit транзакцию
    const { transactions: commitTransactions } = await createTransactions({
      priorityEntries: [],
      entries, // Используем актуальный список UTXO
      outputs: [{
        address: P2SHAddress.toString(),
        amount: kaspaToSompi("0.3")! // Количество KAS, отправляемое на P2SH адрес
      }],
      changeAddress: address.toString(),
      priorityFee: kaspaToSompi(priorityFeeValue.toString())!, // Комиссия за Commit транзакцию
      networkId: network
    });

    let commitHash: any;
    for (const transaction of commitTransactions) {
      transaction.sign([privateKey]);
      log(`Main: Commit Transaction signed with ID: ${transaction.id}`, 'DEBUG');
      commitHash = await transaction.submit(RPC); // Отправляем Commit транзакцию
      log(`submitted P2SH commit sequence transaction on: ${commitHash}`, 'INFO');
      // Устанавливаем SubmittedtrxId для обработчика событий (если он нужен для логирования/отладки)
      // Основное ожидание теперь через поллинг getUtxosByAddresses
      SubmittedtrxId = commitHash;
    }

    // Ожидание появления UTXO Commit транзакции на P2SH адресе
    // Используем поллинг getUtxosByAddresses, это надежнее, чем только событие
    log(`Main: Waiting for commit transaction output (${commitHash}) to appear on P2SH address...`, 'INFO');
    let commitOutputAppeared = false;
    const commitOutputTimeout = setTimeout(() => {
      if (!commitOutputAppeared) {
        log(`Timeout: Commit transaction output (${commitHash}) did not appear on P2SH address within timeout`, 'ERROR');
        process.exit(1); // Если Commit не подтвердился, дальнейшие действия невозможны
      }
    }, timeout);

    // Сбрасываем eventReceived, так как теперь ждем через поллинг, а не только событие
    // eventReceived = false; // Эта строка была тут, но лучше полагаться на поллинг

    while (!commitOutputAppeared) {
      await new Promise(resolve => setTimeout(resolve, 50)); // Частота опроса: 500ms
      try {
        const { entries: p2shUtxos } = await RPC.getUtxosByAddresses({ addresses: [P2SHAddress.toString()] });
        // Ищем UTXO с ID транзакции, равным хэшу Commit
        const foundCommitOutput = p2shUtxos.find(utxo =>
            utxo.entry.outpoint.transactionId === commitHash
        );
        if (foundCommitOutput) {
          log(`Main: Commit transaction output (${commitHash}) appeared on P2SH address.`, 'INFO');
          commitOutputAppeared = true;
        } else {
          log(`Main: Still waiting for commit transaction output (${commitHash})...`, 'DEBUG');
        }
      } catch (fetchError) {
        log(`Error fetching P2SH UTXOs during commit confirmation wait: ${fetchError}`, 'ERROR');
        // Ошибка при получении UTXO - это критично.
        process.exit(1);
      }
    }
    clearTimeout(commitOutputTimeout);

    // --- НЕБОЛЬШАЯ ДОБАВОЧНАЯ ЗАДЕРЖКА ПОСЛЕ ПОЯВЛЕНИЯ UTXO ---
    // Это может помочь избежать ошибки "orphan" при отправке Reveal,
    // давая узлу немного времени ПОСЛЕ того, как UTXO стал виден
    const postCommitVisibleDelay = 100; // Экспериментируйте, начните с 100-200ms
    log(`Main: Adding post-commit output visible delay of ${postCommitVisibleDelay}ms...`, 'DEBUG');
    await new Promise(resolve => setTimeout(resolve, postCommitVisibleDelay));
    log(`Main: Delay finished. Proceeding with reveal transaction creation.`, 'DEBUG');
    // --- КОНЕЦ НЕБОЛЬШОЙ ДОБАВОЧНОЙ ЗАДЕРЖКИ ---

    log(`Main: Commit transaction confirmed. Proceeding with reveal.`, 'INFO');
    // --- КОНЕЦ: Commit Transaction Part ---


    // --- НАЧАЛО: Reveal Transaction Part ---
    // Получаем АКТУАЛЬНЫЕ списки UTXO для Reveal транзакции
    log(`Main: Fetching UTXO entries for reveal transaction...`, 'DEBUG');
    const { entries: mainUtxosForReveal } = await RPC.getUtxosByAddresses({ addresses: [address.toString()] });
    const { entries: p2shUtxoForReveal } = await RPC.getUtxosByAddresses({ addresses: [P2SHAddress.toString()] }); // Получаем UTXO для P2SH адреса

    // Находим ТОТ САМЫЙ UTXO, который был создан Commit транзакцией
    const commitOutputUtxo = p2shUtxoForReveal.find(utxo => utxo.entry.outpoint.transactionId === commitHash);

    if (!commitOutputUtxo) {
      log(`Error: P2SH UTXO from commit transaction (${commitHash}) not found for reveal. This should not happen after waiting.`, 'ERROR');
      process.exit(1); // Критическая ошибка
    }

    log(`Main: Found commit output UTXO for reveal: ${JSON.stringify(commitOutputUtxo, (key, value) => typeof value === 'bigint' ? value.toString() + 'n' : value)}`, 'DEBUG');


    // Создаем Reveal транзакцию
    const { transactions: revealTransactions } = await createTransactions({
      priorityEntries: [commitOutputUtxo], // Главный вход: UTXO с P2SH адреса
      entries: mainUtxosForReveal, // Дополнительные входы: UTXO с основного адреса для комиссии/сдачи
      outputs: [], // Reveal транзакция не создает новых выходов на известные адреса (вся "сдача" отправляется на ваш основной адрес автоматически, если outputs пуст)
      changeAddress: address.toString(), // Адрес для сдачи
      priorityFee: kaspaToSompi(gasFee.toString())!, // Комиссия за Reveal транзакцию
      networkId: network
    });

    let revealHash: any;

    // ### Сохраняем ВХОДЫ этой Reveal транзакции перед ее отправкой ###
    // Это нужно, чтобы в НАЧАЛЕ СЛЕДУЮЩЕЙ итерации дождаться их исчезновения.
    if (revealTransactions.length > 0) {
      inputsUsedInPreviousReveal = revealTransactions[0].transaction.inputs.map(input => ({
        outpoint: {
          transactionId: input.previousOutpoint.transactionId,
          index: input.previousOutpoint.index
        }
        // Вам могут понадобиться другие поля, если структура input другая
      }));
      log(`Main: Stored inputs for next loop's confirmation check: ${JSON.stringify(inputsUsedInPreviousReveal)}`, 'DEBUG');
    } else {
      inputsUsedInPreviousReveal = []; // Если Reveal транзакций нет (чего быть не должно при нормальной работе)
      log(`Warning: No reveal transactions created.`, 'WARN');
    }


    for (const transaction of revealTransactions) {
      // Подписываем входы с основного адреса
      transaction.sign([privateKey], false);
      log(`Main: Reveal Transaction (partial) signed with ID: ${transaction.id}`, 'DEBUG');

      // Находим индекс входа, соответствующего P2SH UTXO, и заполняем его ScriptSig
      const p2shInputIndex = transaction.transaction.inputs.findIndex((input) =>
          input.previousOutpoint.transactionId === commitOutputUtxo.entry.outpoint.transactionId &&
          input.previousOutpoint.index === commitOutputUtxo.entry.outpoint.index
      );

      if (p2shInputIndex === -1) {
        log(`Error: Could not find the P2SH input in the reveal transaction inputs.`, 'ERROR');
        // Это серьезная ошибка, не позволяющая создать корректную Reveal транзакцию
        process.exit(1);
      }

      // Создаем и заполняем ScriptSig для P2SH входа
      const signature = await transaction.createInputSignature(p2shInputIndex, privateKey);
      transaction.fillInput(p2shInputIndex, script.encodePayToScriptHashSignatureScript(signature));
      log(`Main: P2SH input filled with signature script.`, 'DEBUG');

      revealHash = await transaction.submit(RPC); // Отправляем Reveal транзакцию
      log(`submitted reveal tx sequence transaction: ${revealHash}`, 'INFO');
      // SubmittedtrxId = revealHash; // Можно установить, если обработчик событий используется для логирования Reveal

      // ### Мы НЕ ждем здесь подтверждения Reveal транзакции с помощью eventReceived! ###
      // Ожидание подтверждения этой Reveal транзакции произойдет в НАЧАЛЕ СЛЕДУЮЩЕЙ итерации цикла,
      // когда будет проверяться исчезновение ее входов из списка доступных UTXO.

    }
    // --- КОНЕЦ: Reveal Transaction Part ---


    // ### Ожидание завершения последней итерации перед отключением ###
    // Если это последняя итерация, явно дождемся подтверждения последней Reveal транзакции
    if (i === loops - 1) {
      log(`Main: Finished all loops. Waiting for final reveal transaction confirmation before disconnecting...`, 'INFO');
      let finalRevealConfirmed = false;
      const finalRevealTimeout = setTimeout(() => {
        if (!finalRevealConfirmed) {
          log('Timeout: Final reveal transaction did not confirm before disconnecting', 'ERROR');
          // Решите, что делать, если последняя транзакция не подтвердилась.
          // Возможно, просто завершить с ошибкой, но без зависания.
          process.exit(1);
        }
      }, timeout);

      // Повторяем логику ожидания исчезновения входов, но уже вне цикла итераций
      while (!finalRevealConfirmed) {
        await new Promise(resolve => setTimeout(resolve, 50));
        try {
          const { entries: currentUtxosMain } = await RPC.getUtxosByAddresses({ addresses: [address.toString()] });
          const { entries: currentUtxosP2SH } = await RPC.getUtxosByAddresses({ addresses: [P2SHAddress.toString()] });
          const currentUtxos = [...currentUtxosMain, ...currentUtxosP2SH];

          const allInputsRemoved = inputsUsedInPreviousReveal.every(spentInput =>
              !currentUtxos.some(currentUtxo =>
                  currentUtxo.entry.outpoint.transactionId === spentInput.outpoint.transactionId &&
                  currentUtxo.entry.outpoint.index === spentInput.outpoint.index
              )
          );

          if (allInputsRemoved) {
            log(`Main: Final reveal transaction confirmed. Disconnecting.`, 'INFO');
            finalRevealConfirmed = true;
          } else {
            log(`Main: Still waiting for inputs from final reveal tx to disappear...`, 'DEBUG');
          }
        } catch (fetchError) {
          log(`Error fetching UTXOs during final confirmation wait: ${fetchError}`, 'ERROR');
          // Ошибка при получении UTXO при финальной проверке
          process.exit(1);
        }
      }
      clearTimeout(finalRevealTimeout);

      // После подтверждения последней транзакции можно отключиться
      await RPC.disconnect();
      log('RPC client disconnected.', 'INFO');
    }

  } catch (loopError) { // Ловим ошибки внутри одной итерации цикла
    log(`Loop iteration ${i + 1} failed: ${loopError}`, 'ERROR');
    // Решите, что делать при ошибке в итерации:
    // throw loopError; // Перебросить ошибку и остановить скрипт
    // continue;       // Перейти к следующей итерации (опасно, если ошибка связана с состоянием)
    break;          // Прекратить выполнение цикла при первой ошибке
  }
} // Конец цикла

// Если цикл завершился без ошибок и не было последней итерации (например, loops=1),
// то отключение может не произойти. Лучше добавить его здесь, если оно не было вызвано в последней итерации.
// if (loops === 0 || loops > 0 && !RPC.isConnected) { // Проверяем, что уже не отключились
//     try {
//          await RPC.disconnect();
//          log('RPC client disconnected after loop.', 'INFO');
//     } catch (e) {
//          log(`Error during final disconnect: ${e}`, 'ERROR');
//     }
// }

log('Script finished.', 'INFO');