import {app, BrowserWindow, ipcMain} from 'electron'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {
  addAndSaveWallet,
  completePasswordSetup,
  createAndSaveWallet, deleteWallet,
  getMasterEncryptionKey, getPrivateKeys,
  getWalletsListForFrontend, importAndSaveWallet,
  initializeDatabase,
  isPasswordSetupComplete,
  lockStorage, renameWallet,
  unlockStorage,
} from '../src/api/utils/wallet-service.ts'; // Убедитесь, что путь правильный
import {KasplexApi, Kiwi, Rpc, Wasm} from "@kasplex/kiwi";


import {getBalancesForAddresses} from '../src/api/BalanceChecker/KaspaBalance.ts';
import {getTokensForAddresses} from '../src/api/BalanceChecker/krc20-balance.ts';
import {
  sendKaspaSingleToSingle,
  sendKaspaSingleToMultiple,
  sendKaspaMultipleToSingle
} from "../src/api/TransactionSender/sendKaspa.ts";
import {
  sendTokenMultipleToSingle,
  sendTokenSingleToMultiple,
  sendTokenSingleToSingle
} from "../src/api/TransactionSender/sendToken.ts";
import {checkTickerAvailability, deployKrc20Token} from "../src/api/DeployFunction/deploy.ts";
import {MintProgressUpdate, startMintProcess, stopMintProcess} from '../src/api/MintFunction/mint.ts';
type KaspaTransactionType = 'singleToSingle' | 'singleToMultiple' | 'multipleToSingle';

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let currentNetwork = 'Testnet';
let initialPasswordSetupStatus: boolean = false;
let win: BrowserWindow | null



//Главное окно
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false
    },
  })

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    const initialState = initialPasswordSetupStatus ? 'login' : 'create-password';
    win?.webContents.send('app-state-update', initialState);
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    lockStorage()
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})


ipcMain.handle('set-network', async (event, network: string) => {
  currentNetwork = network;
  try {
    if (currentNetwork === 'mainnet'){
      await Rpc.setInstance(Wasm.NetworkType.Testnet).disconnect();
      Kiwi.setNetwork(Wasm.NetworkType.Mainnet);
      await Rpc.setInstance(Wasm.NetworkType.Mainnet).connect()
    }
    else{
      await Rpc.setInstance(Wasm.NetworkType.Mainnet).disconnect();
      Kiwi.setNetwork(Wasm.NetworkType.Testnet);
      await Rpc.setInstance(Wasm.NetworkType.Testnet).connect()
    }
    console.log(`Successfully changed RPC network to ${currentNetwork} and reconnected.`);
  } catch (rpcChangeError: any) {
    console.error(`Error changing RPC network to ${currentNetwork} and reconnecting: ${rpcChangeError.message || rpcChangeError}`);
  }
  await fetchAndSendWalletsToRenderer(event.sender);
  return { success: true};
});

ipcMain.handle('get-initial-network', async () => {
  return 1
});

ipcMain.handle('get-current-network', async () => {
  try {
    // Сравниваем текущую сеть с константой из Wasm
    if (Kiwi.network === Wasm.NetworkType.Mainnet) {
      return { success: true, network: 'Mainnet' };
    } else {
      // Во всех остальных случаях (Testnet, Devnet и т.д.) возвращаем Testnet для простоты
      return { success: true, network: 'Testnet' };
    }
  } catch (error: any) {
    console.error("Error getting current network:", error);
    return { success: false, error: error.message || "Unknown error" };
  }
});

ipcMain.handle('create-password', async (event, password: string) => {
  console.log(`Received 'setup-password' request.`);

  if (!password || password.length < 8) {
    console.warn("Setup password too short.");
    throw new Error("Password must be at least 8 characters long.");
  }

  if (isPasswordSetupComplete()) {
    console.warn("Setup already complete. Rejecting setup-password request.");
    throw new Error("Password setup is already complete.");
  }

  try {
    await completePasswordSetup(password);
    await unlockStorage(password);
    event.sender.send('app-state-update', 'dashboard');
    return { success: true };

  } catch (error: any) {
    console.error(`Error handling 'setup-password' IPC: ${error.message || error}`);
    throw new Error(`Failed to setup password: ${error.message || error}`);
  }
});

ipcMain.handle('login', async (event, password: string) => {
  console.log(`Received 'login' request.`);

  if (!password) {
    console.warn("Login attempt with empty password.");
    throw new Error("Password cannot be empty.");
  }

  // ### Проверяем, завершена ли установка пароля ###
  if (!isPasswordSetupComplete()) {
    console.warn("Login attempted before password setup.");
    throw new Error("Password setup not complete. Please setup a password first.");
  }


  try {
    await unlockStorage(password);
    console.log("Storage unlocked successfully via login.");

    event.sender.send('app-state-update', 'dashboard');
    await fetchAndSendWalletsToRenderer(event.sender);
    console.log("Sent 'app-state-update' to 'dashboard' after successful login.");

    return { success: true };

  } catch (error: any) {
    console.error(`Error handling 'login' IPC: ${error.message || error}`);
    throw new Error(`Login failed: ${error.message || 'Unknown error'}`);
  }
});

ipcMain.handle('get-wallets', async (event) => {
  console.log(`Received 'get-wallets' request.`);
  return fetchAndSendWalletsToRenderer(event.sender);
});

ipcMain.handle('get-private-keys', async (event, addresses: string[]) => {
  try {
    const privateKeys = await getPrivateKeys(addresses);
    return Array.from(privateKeys.entries());
  } catch (error: any) {
    console.error(`IPC Handler Error:`, error);
    throw new Error(`Failed to get private keys: ${error.message}`);
  }
});

ipcMain.handle('create-wallet', async (event, name?: string) => {
  console.log(`Received 'create-wallet' request${name ? ` with name: ${name}` : ''}.`);

  const masterKey = getMasterEncryptionKey();
  if (!masterKey) {
    console.warn("Wallet creation attempt failed: Storage locked.");
    throw new Error("Storage is locked. Please log in to create a wallet.");
  }
  // TODO: Проверка инициализации БД, если createAndSaveWallet ее не делает

  try {
    const newWalletInfo = await createAndSaveWallet(Kiwi.network, name);
    console.log(`New wallet created and saved: ID=${newWalletInfo.id}, Address=${newWalletInfo.address} for network: ${currentNetwork}.`);
    await fetchAndSendWalletsToRenderer(event.sender);
    return { success: true, newWalletId: String(newWalletInfo.id), newWalletAddress: newWalletInfo.address };
  }
  catch (error: any) {
    console.error(`Error handling 'create-wallet' IPC: ${error.message || error}`);
    throw new Error(`Failed to create wallet: ${error.message || error}`);
  }
});

ipcMain.handle('import-wallet', async (event, key: string, name: string) => {
  console.log(`Received 'create-wallet' request${name ? ` with name: ${name}` : ''}.`);

  const masterKey = getMasterEncryptionKey();
  if (!masterKey) {
    console.warn("Wallet creation attempt failed: Storage locked.");
    throw new Error("Storage is locked. Please log in to create a wallet.");
  }
  // TODO: Проверка инициализации БД, если createAndSaveWallet ее не делает

  try {
    const newWalletInfo = await importAndSaveWallet(key, name);
    console.log(`New wallet created and saved: ID=${newWalletInfo.id}, Address=${newWalletInfo.address} for network: ${currentNetwork}.`);
    await fetchAndSendWalletsToRenderer(event.sender);
    return { success: true, newWalletId: String(newWalletInfo.id), newWalletAddress: newWalletInfo.address };
  }
  catch (error: any) {
    console.error(`Error handling 'import-wallet' IPC: ${error.message || error}`);
    return { success: false, error: `Failed to import wallet: ${error.message || error}` };
  }
});

ipcMain.handle('delete-wallet', async (event, address: string) => {
  console.log(`Main: Received 'delete-wallet' request for address: ${address}`);
  const masterKey = getMasterEncryptionKey();
  if (!masterKey) {
    throw new Error("Storage locked. Cannot delete wallet.");
  }
  if (address.trim() === '') {
    throw new Error("Invalid wallet address provided for deletion.");
  }
  try {
    const deleted = await deleteWallet(address);
    if (deleted) {
      console.log(`Main: Successfully deleted wallet with address: ${address}.`);
      await fetchAndSendWalletsToRenderer(event.sender);
      return { success: true };
    } else {
      console.warn(`Main: Wallet with address ${address} not found or could not be deleted.`);
      return { success: false, message: `Wallet with address ${address} not found.` };
    }
  } catch (error: any) {
    console.error(`Main: Error handling 'delete-wallet' IPC for address ${address}: ${error.message || error}`);
    throw new Error(`Failed to delete wallet: ${error.message || error}`);
  }
});

ipcMain.handle('rename-wallet', async (event, address: string, newName: string) => {
  try {
    const success = await renameWallet(address, newName);
    if (success) {
      await fetchAndSendWalletsToRenderer(event.sender);
      return { success: true };
    } else {
      return { success: false, error: 'Wallet not found or name unchanged.' };
    }
  } catch (error: any) {
    console.error("Error handling 'rename-wallet' IPC:", error);
    return { success: false, error: error.message || 'Unknown error' };
  }
});

ipcMain.handle('add-wallet', async (event, key: string, name: string) => {
  console.log(`Received 'create-wallet' request${name ? ` with name: ${name}` : ''}.`);

  const masterKey = getMasterEncryptionKey();
  if (!masterKey) {
    console.warn("Wallet creation attempt failed: Storage locked.");
    throw new Error("Storage is locked. Please log in to create a wallet.");
  }

  try {
    const newWalletInfo = await addAndSaveWallet(key, name);
    console.log(`New wallet created and saved: ID=${newWalletInfo.id}, Address=${newWalletInfo.address} for network: ${currentNetwork}.`);
    await fetchAndSendWalletsToRenderer(event.sender);
    return { success: true, newWalletId: String(newWalletInfo.id), newWalletAddress: newWalletInfo.address };
  }
  catch (error: any) {
    console.error(`Error handling 'add-wallet' IPC: ${error.message || error}`);
    return { success: false, error: `Failed to import wallet: ${error.message || error}` };
  }
});

ipcMain.handle('get-tokens-for-addresses', async (_event, addresses: string[]) => {
  try {
    console.log(`Main Process: Received request for Kaspa tokens for addresses:`, addresses);
    const tokensMap = await getTokensForAddresses(addresses);
    const tokensObject = Object.fromEntries(tokensMap.entries());
    console.log(`Main Process: Sending Kaspa tokens back to renderer:`, tokensObject);
    return tokensObject;
  } catch (error: any) {
    console.error(`Main Process: Error getting Kaspa tokens for multiple addresses: ${error.message || error}`);
    throw error;
  }
});

ipcMain.handle('send-funds', async (event, senderAddresses: string[], recipientDetails: Array<{ address: string; amount: string; }>, transactionType: KaspaTransactionType, ticker: string, fee: string) => {

  if (ticker !== 'Kaspa') {
    try {
      const feeInSompi = Wasm.kaspaToSompi(fee);
      if (typeof feeInSompi !== 'bigint' || feeInSompi < 0) {
        return { success: false, error: 'Неверный формат или значение комиссии.' };
      }

      const privateKeysMap = await getPrivateKeys(senderAddresses);
      if (privateKeysMap.size === 0) {
        return { success: false, error: 'Для указанных адресов отправителей не найдено приватных ключей.' };
      }

      // Общая задержка и обновление UI после выполнения любой операции
      const postTransactionActions = async () => {
        await new Promise(resolve => setTimeout(resolve, 3500));
        await fetchAndSendWalletsToRenderer(event.sender);
      };

      switch (transactionType) {
        case 'singleToSingle': {

          if (senderAddresses.length === 0 || !senderAddresses[0]) {
            return { success: false, error: 'Не указан адрес отправителя для транзакции SingleToSingle.' };
          }
          if (recipientDetails.length === 0 || !recipientDetails[0]) {
            return { success: false, error: 'Не указан адрес или сумма получателя для транзакции SingleToSingle.' };
          }

          const senderPrivateKey = privateKeysMap.get(senderAddresses[0]);
          if (!senderPrivateKey) {
            return { success: false, error: `Приватный ключ для адреса отправителя ${senderAddresses[0]} не найден.` };
          }

          const txid = await sendTokenSingleToSingle(
              senderPrivateKey, recipientDetails, feeInSompi, ticker
          );
          await postTransactionActions();
          return { success: true, txid };
        }

        case 'singleToMultiple': {

          if (senderAddresses.length !== 1) {
            return { success: false, error: 'Для типа "singleToMultiple" требуется ровно один адрес отправителя.' };
          }
          if (recipientDetails.length === 0) {
            return { success: false, error: 'Для типа "singleToMultiple" требуется хотя бы один получатель.' };
          }
          const senderPrivateKey = privateKeysMap.get(senderAddresses[0]);
          if (!senderPrivateKey) {
            return { success: false, error: `Приватный ключ для адреса ${senderAddresses[0]} не найден.` };
          }

          const txids = await sendTokenSingleToMultiple(
              senderPrivateKey, recipientDetails, feeInSompi, ticker
          );
          await postTransactionActions();
          return { success: true, txids: txids };
        }

        case 'multipleToSingle': {

          if (recipientDetails.length !== 1 || !recipientDetails[0].amount) {
            return { success: false, error: 'Для этого типа транзакции требуется один получатель и сумма, отправляемая с КАЖДОГО кошелька.' };
          }
          if (senderAddresses.length === 0) {
            return { success: false, error: 'Выберите хотя бы один кошелек-отправитель.' };
          }

          const results = await sendTokenMultipleToSingle(
              senderAddresses,
              privateKeysMap,
              recipientDetails[0].address,
              recipientDetails[0].amount,
              feeInSompi,
              ticker
          );
          await postTransactionActions();

          const successfulTxs = results.filter(r => r.status === 'success');
          const failedTxs = results.filter(r => r.status === 'failed');

          if (failedTxs.length > 0) {
            return {
              success: false,
              error: `Операция завершена с ошибками. Успешно: ${successfulTxs.length}, с ошибкой: ${failedTxs.length}.`,
              details: results // Отправляем все детали на фронтенд для отображения
            };
          }
          return {
            success: true,
            txids: successfulTxs.map(r => r.txid!), // Возвращаем массив всех txid
            details: results
          };
        }

        default:
          return { success: false, error: 'Неизвестный тип транзакции.' };
      }
    } catch (error: any) {
      console.error(`Ошибка при отправке токена ${ticker}: ${error.message}`);
      return { success: false, error: error.message || 'Произошла неизвестная ошибка.' };
    }
  }
  else{
    try {
      const feeInSompi = Wasm.kaspaToSompi(fee);
      if (typeof feeInSompi !== 'bigint' || feeInSompi < 0) {
        return { success: false, error: 'Неверный формат или значение комиссии.' };
      }

      const privateKeysMap = await getPrivateKeys(senderAddresses);
      if (privateKeysMap.size === 0) {
        return { success: false, error: 'Для указанных адресов отправителей не найдено приватных ключей.' };
      }

      const postTransactionActions = async () => {
        await new Promise(resolve => setTimeout(resolve, 3500));
        await fetchAndSendWalletsToRenderer(event.sender);
      };
      switch (transactionType) {
        case 'singleToSingle': {
          if (senderAddresses.length === 0 || !senderAddresses[0]) {
            return { success: false, error: 'Не указан адрес отправителя для транзакции SingleToSingle.' };
          }
          if (recipientDetails.length === 0 || !recipientDetails[0]) {
            return { success: false, error: 'Не указан адрес или сумма получателя для транзакции SingleToSingle.' };
          }

          const senderPrivateKey = privateKeysMap.get(senderAddresses[0]);
          if (!senderPrivateKey) {
            return { success: false, error: `Приватный ключ для адреса отправителя ${senderAddresses[0]} не найден.` };
          }

          const txid = await sendKaspaSingleToSingle(
              senderPrivateKey,
              recipientDetails,
              feeInSompi
          );
          await postTransactionActions();
          return { success: true, txid }
        }

        case 'singleToMultiple': {
          if (senderAddresses.length !== 1) {
            return { success: false, error: 'Для типа "singleToMultiple" требуется ровно один адрес отправителя.' };
          }
          if (recipientDetails.length === 0) {
            return { success: false, error: 'Для типа "singleToMultiple" требуется хотя бы один получатель.' };
          }
          const senderPrivateKey = privateKeysMap.get(senderAddresses[0]);
          if (!senderPrivateKey) {
            return { success: false, error: `Приватный ключ для адреса ${senderAddresses[0]} не найден.` };
          }

          const txids = await sendKaspaSingleToMultiple(
              senderPrivateKey,
              recipientDetails, // Передаем ВЕСЬ массив получателей
              feeInSompi
          );
          await postTransactionActions();
          return { success: true, txids: txids }
        }

        case 'multipleToSingle': {
          if (recipientDetails.length !== 1 || !recipientDetails[0].amount) {
            return { success: false, error: 'Для этого типа транзакции требуется один получатель и сумма, отправляемая с КАЖДОГО кошелька.' };
          }
          if (senderAddresses.length === 0) {
            return { success: false, error: 'Выберите хотя бы один кошелек-отправитель.' };
          }

          // Вызываем нашу новую, правильную функцию
          const results = await sendKaspaMultipleToSingle(
              senderAddresses,
              privateKeysMap,
              recipientDetails[0].address,
              recipientDetails[0].amount, // Эта сумма будет отправлена с КАЖДОГО кошелька
              feeInSompi // Эта комиссия будет применена к КАЖДОЙ транзакции
          );

          await postTransactionActions();

          // Анализируем результаты
          const successfulTxs = results.filter(r => r.status === 'success');
          const failedTxs = results.filter(r => r.status === 'failed');

          if (failedTxs.length > 0) {
            return {
              success: false,
              error: `Операция завершена с ошибками. Успешно: ${successfulTxs.length}, с ошибкой: ${failedTxs.length}.`,
              details: results // Отправляем все детали на фронтенд для отображения
            };
          }
          return {
            success: true,
            txids: successfulTxs.map(r => r.txid!), // Возвращаем массив всех txid
            details: results
          };
        }
        default:
          return { success: false, error: 'Неизвестный тип транзакции.' };
      }
    } catch (error: any) {
      console.error(`Ошибка при отправке Kaspa транзакции: ${error.message}`);
      // Возвращаем текст ошибки из нашей бизнес-логики, а не системные ошибки
      return { success: false, error: error.message || 'Произошла неизвестная ошибка при отправке транзакции.' };
    }
  }

});

ipcMain.handle('deploy', async (event, { action, payload }) => {
  try {
    let txid;
    let isAvailable;
    switch (action) {
      case 'deploy':
        txid = await deployKrc20Token(payload);
        return { success: true, txid };

      case 'checkTicker':
        isAvailable = await checkTickerAvailability(payload.ticker);
        return { success: true, available: isAvailable };

      default:
        return { success: false, error: 'Unknown Kasplex action' };
    }
  } catch (error: any) {
    console.error(`Error during Kasplex action '${action}':`, error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('start-mint', async (event, params: { processId: string; walletAddress: string; ticker: string; mintTimes: number; fee: string }) => {
  const { walletAddress } = params;

  try {
    const privateKeys = await getPrivateKeys([walletAddress]);
    const privateKey = privateKeys.get(walletAddress);

    if (!privateKey) {
      throw new Error(`Private key not found for address ${walletAddress}`);
    }

    // Создаем колбэк, который будет отправлять данные обратно на фронтенд
    const onProgressCallback = (update: MintProgressUpdate) => {
      // Убеждаемся, что окно еще существует перед отправкой
      if (win && !win.isDestroyed()) {
        win.webContents.send('mint-progress-update', update);
      }
    };

    // Запускаем процесс в фоне, не дожидаясь его завершения здесь.
    // Хендлер должен быстро вернуть ответ, а процесс будет жить своей жизнью.
    startMintProcess({
      processId: params.processId,
      privateKey: privateKey,
      ticker: params.ticker,
      mintTimes: params.mintTimes,
      feeInKas: params.fee,
    }, onProgressCallback);

    // Сразу возвращаем успех, т.к. процесс запущен
    return { success: true };

  } catch (e: any) {
    // Возвращаем ошибку, если не удалось даже запустить процесс
    return { success: false, error: e.message || "Failed to start mint process." };
  }
});

// Остановка минта (обновленный хендлер)
ipcMain.handle('stop-mint', async (_event, processId: string) => {
  const success = stopMintProcess(processId);
  if (success) {
    return { success: true };
  }
  return { success: false, error: 'Process not found or already stopped.' };
});

ipcMain.handle('get-token-info', async (_event, ticker: string) => {
  // 1. Валидация входных данных
  if (!ticker || ticker.trim() === '') {
    return { success: false, error: 'Invalid ticker provided. Ticker must be a non-empty string.' };
  }

  try {
    // 2. Выполнение запроса к API. Рекомендуется приводить тикер к нижнему регистру,
    // так как многие системы регистронезависимы.
    const response = await KasplexApi.getToken(ticker.toLowerCase());

    // 3. Анализ ответа от API
    if (response && response.message === 'successful') {
      // Успешный ответ
      if (Array.isArray(response.result) && response.result.length > 0) {
        // Токен найден, возвращаем первый ( и единственный) элемент
        return { success: true, data: response.result[0] };
      } else {
        // Успешный ответ, но массив пуст - токен не найден
        return { success: false, error: `Token with ticker "${ticker}" not found.` };
      }
    } else {
      // Ответ от API с сообщением об ошибке
      return { success: false, error: response.message || 'API returned an unsuccessful response.' };
    }
  } catch (e: any) {
    // 4. Обработка сетевых ошибок или других исключений
    console.error(`Error in 'get-token-info' handler for ticker "${ticker}":`, e);
    return { success: false, error: e.message || `Failed to fetch info for ${ticker}. Check your network connection.` };
  }
});

///KAS.FYI
ipcMain.handle('get-token-market-info', async (_event, ticker: string) => {
  if (!ticker || typeof ticker !== 'string') {
    return { success: false, error: 'Invalid ticker provided.' };
  }

  // Используем новый, правильный URL
  const apiUrl = `https://api.kaspa.com/krc20/${ticker.toUpperCase()}`;

  try {
    console.log(`[Proxy] Fetching: ${apiUrl}`);
    const response = await fetch(apiUrl);

    if (!response.ok) {
      // API может вернуть 404 для токенов без данных, это не ошибка приложения
      if (response.status === 404) {
        console.warn(`[Proxy] No market data found for ${ticker} (404).`);
        return { success: true, data: null }; // Успешный ответ, но данных нет
      }
      throw new Error(`API responded with status: ${response.status}`);
    }

    const data = await response.json();
    return { success: true, data: data };

  } catch (error: any) {
    console.error(`[Proxy] Error fetching data for ${ticker}:`, error);
    return { success: false, error: error.message };
  }
});

async function fetchAndSendWalletsToRenderer(targetWebContents: Electron.WebContents) {
  console.log(`Main: Fetching and sending wallets for network: ${currentNetwork} to renderer.`);
  try {
    const walletsFromDb = await getWalletsListForFrontend();
    console.log(`Main: Fetched ${walletsFromDb.length} wallets from DB for network ${currentNetwork}.`);

    if (walletsFromDb.length === 0) {
      console.log("Main: No wallets in DB for the current network. Sending empty list.");
      return [];
    }

    const addresses = walletsFromDb.map(w => w.address);
    console.log(`Main: Extracted ${addresses.length} addresses for balance check.`);

    const balances = await getBalancesForAddresses(addresses);
    console.log("Main: Fetched balances from RPC.");
    const walletsWithBalances = walletsFromDb.map(wallet => {
      const balanceStr = balances[wallet.address];

      return {
        id: String(wallet.id),
        name: wallet.name,
        address: wallet.address,
        balance: balanceStr,
        withdrawal: wallet.withdrawal,
      };
    });

    console.log(`Main: Prepared ${walletsWithBalances.length} wallets with balances. Sending to renderer.`);

    targetWebContents.send('wallets-updated', walletsWithBalances);

  } catch (error: any) {
    console.error(`Main: Error in fetchAndSendWalletsToRenderer: ${error.message || error}`);
  }
}

app.whenReady().then(async () => {
  console.log('App is ready. Determining database path and initializing...');

  try {
    initializeDatabase();
    console.log("Database initialization call finished.");
  } catch (error) {
    console.error("FATAL ERROR: Database failed to initialize.", error);
    app.quit();
    return; // Выходим
  }
  initialPasswordSetupStatus = isPasswordSetupComplete();
  Kiwi.setNetwork(Wasm.NetworkType.Testnet);
  createWindow();
});


