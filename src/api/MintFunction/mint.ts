import {KRC20, Utils, Enum, Wasm, Rpc, Kiwi, KasplexApi} from '@kasplex/kiwi';
import {parseUnits} from "viem";
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function waitForBalanceChange(
    address: string,
    ticker: string,
    decimals: number,
    initialBalance: bigint,
    timeoutMs: number = 120000,
    pollIntervalMs: number = 1500
): Promise<bigint> {
  const startTime = Date.now();
  console.log(`[Mint Service] Waiting for balance of "${ticker}" on address ${address.slice(0,10)}... to exceed ${initialBalance}.`);

  while (Date.now() - startTime < timeoutMs) {
    await delay(pollIntervalMs);
    try {
      const response = await KasplexApi.getBalance(address, ticker);

      if (response.message === 'successful' && response.result.length > 0) {
        const tokenData = response.result[0];
        // Конвертируем строковый баланс в BigInt с учетом decimals
        const currentBalance = parseUnits(tokenData.balance, decimals);

        if (currentBalance > initialBalance) {
          console.log(`[Mint Service] Balance for "${ticker}" updated. New balance: ${currentBalance}`);
          return currentBalance; // Успех, возвращаем новый баланс
        }
      }
      // Если токена еще нет на балансе, result будет пустым, это нормально, продолжаем опрос.

    } catch (error: any) {
      console.warn(`[Mint Service] Polling for balance failed, will retry. Error: ${error.message}`);
    }
  }
  throw new Error(`Balance for "${ticker}" did not change within ${timeoutMs / 1000} seconds.`);
}


export interface MintProgressUpdate {
  processId: string;
  currentIndex: number;
  total: number;
  txid: string;
  status: 'active' | 'finished' | 'error' | 'stopped';
  error?: string;
}

interface StartMintParams {
  processId: string;
  privateKey: string;
  ticker: string;
  mintTimes: number;
  feeInKas: string;
}

const activeMintProcesses = new Map<string, { isRunning: boolean }>();
const BATCH_SIZE = 3;

// Хранилище для управления состоянием активных процессов
export async function startMintProcess(
    params: StartMintParams,
    onProgress: (update: MintProgressUpdate) => void
): Promise<void> {
  const { processId, privateKey: privateKeyStr, ticker, mintTimes, feeInKas } = params;

  if (activeMintProcesses.has(processId)) { throw new Error(`Process ${processId} already running.`); }
  activeMintProcesses.set(processId, { isRunning: true });

  let totalMintsCompleted = 0;

  try {
    const _privateKey = new Wasm.PrivateKey(privateKeyStr);
    const fromAddress = _privateKey.toPublicKey().toAddress(Kiwi.network).toString();
    await Rpc.setInstance(Kiwi.network).connect();

    const krc20data = Utils.createKrc20Data({ p: "krc-20", op: Enum.OP.Mint, tick: ticker });
    const feeSompi = Wasm.kaspaToSompi(feeInKas);

    // Получаем информацию о токене ОДИН РАЗ в начале, чтобы узнать decimals
    const tokenInfoResponse = await KasplexApi.getToken(ticker);
    if (tokenInfoResponse.message !== 'successful' || !tokenInfoResponse.result[0]) {
      throw new Error(`Could not fetch info for ticker "${ticker}".`);
    }
    const tokenDecimals = parseInt(tokenInfoResponse.result[0].dec, 10);

    // Получаем начальный баланс
    const initialBalanceResponse = await KasplexApi.getBalance(fromAddress, ticker);
    let lastKnownBalance = 0n;
    if (initialBalanceResponse.message === 'successful' && initialBalanceResponse.result.length > 0) {
      lastKnownBalance = parseUnits(initialBalanceResponse.result[0].balance, tokenDecimals);
    }

    const totalBatches = Math.ceil(mintTimes / BATCH_SIZE);

    for (let i = 0; i < totalBatches; i++) {
      const processState = activeMintProcesses.get(processId);
      if (!processState || !processState.isRunning) {
        onProgress({ processId, currentIndex: totalMintsCompleted, total: mintTimes, txid: 'N/A', status: 'stopped', error: 'Process stopped by user.' });
        return;
      }

      const mintsInThisBatch = Math.min(BATCH_SIZE, mintTimes - totalMintsCompleted);
      if (mintsInThisBatch <= 0) break;

      let batchFirstTxid = '';
      await KRC20.multiMintWithReuseUtxo(
          _privateKey, krc20data, feeSompi, mintsInThisBatch,
          (index, txid) => {
            if (index === 1) batchFirstTxid = txid;
            onProgress({ processId, currentIndex: totalMintsCompleted + index, total: mintTimes, txid, status: 'active' });
          }
      );

      totalMintsCompleted += mintsInThisBatch;
      onProgress({ processId, currentIndex: totalMintsCompleted, total: mintTimes, txid: batchFirstTxid, status: 'confirming' });

      // Ждем изменения баланса
      lastKnownBalance = await waitForBalanceChange(fromAddress, ticker, tokenDecimals, lastKnownBalance);
    }

    onProgress({ processId, currentIndex: mintTimes, total: mintTimes, txid: 'N/A', status: 'finished' });

  } catch (err: any) {
    onProgress({ processId, currentIndex: totalMintsCompleted, total: mintTimes, txid: 'N/A', status: 'error', error: err.message || 'An unknown error occurred.' });
  } finally {
    activeMintProcesses.delete(processId);
  }
}

// ... stopMintProcess и updateMintFee без изменений
export function stopMintProcess(processId: string): boolean {
  const processState = activeMintProcesses.get(processId);
  if (processState) {
    processState.isRunning = false;
    return true;
  }
  return false;
}
