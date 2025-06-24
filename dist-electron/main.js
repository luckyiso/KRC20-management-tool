import { app, BrowserWindow, ipcMain } from "electron";
import { fileURLToPath } from "node:url";
import * as path from "node:path";
import path__default from "node:path";
import { createRequire as createRequire$1 } from "node:module";
import Database from "better-sqlite3";
import { createRequire } from "module";
import { Mnemonic, Wallet, Kiwi, KaspaApi, KasplexApi, Rpc, Wasm, KaspaTransaction, Utils, Enum, KRC20 } from "@kasplex/kiwi";
import * as nc from "node:crypto";
createRequire(import.meta.url);
async function generateKeys() {
  const mnemonicStr = Mnemonic.random(12);
  const wallet = Wallet.fromMnemonic(mnemonicStr);
  return {
    receivePrivateKey: wallet.toPrivateKey().toString(),
    // PrivateKey объект
    receiveAddress: wallet.toAddress(Kiwi.network).toString()
  };
}
const require$2 = createRequire$1(import.meta.url);
globalThis.WebSocket = require$2("websocket").w3cwebsocket;
const ALGORITHM = "aes-256-cbc";
const IV_LENGTH = 16;
const KEY_LENGTH = 32;
const SALT_STORAGE_LENGTH = 16;
const ITERATIONS = 1e5;
const DIGEST = "sha512";
const SETUP_COMPLETE_SETTING_NAME = "passwordSetupComplete";
const VERIFICATION_BLOCK_VALUE = "Kaspa Wallet Verification String";
let db = null;
function getDbPath() {
  const appDataPath = app.getPath("userData");
  const dbFileName = "wallet.db";
  const dbPath = path.join(appDataPath, dbFileName);
  console.log(`Database path: ${dbPath}`);
  return dbPath;
}
function initializeDatabase() {
  if (db) {
    console.log("Database already initialized.");
    return;
  }
  try {
    const dbPath = getDbPath();
    db = new Database(dbPath);
    console.log("Database opened.");
    db.exec(`
            CREATE TABLE IF NOT EXISTS settings (
                name TEXT PRIMARY KEY,
                value TEXT
            );
        `);
    console.log("Settings table checked/created.");
    db.exec(`
            CREATE TABLE IF NOT EXISTS wallets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE,
                address TEXT,
                encryptedReceivePrivateKey TEXT,
                receiveIv TEXT,
                network INTEGER DEFAULT 1,
                withdrawal INTEGER DEFAULT 0
            );
        `);
    console.log("Wallets table checked/created.");
    console.log("Database initialization complete.");
  } catch (error) {
    console.error("Error initializing or opening database:", error);
  }
}
function getSetting(name) {
  if (!db) {
    throw new Error("Database not initialized.");
  }
  const stmt = db.prepare("SELECT value FROM settings WHERE name = ?");
  const row = stmt.get(name);
  return row ? row.value : null;
}
function setSetting(name, value) {
  if (!db) {
    throw new Error("Database not initialized.");
  }
  const stmt = db.prepare("INSERT OR REPLACE INTO settings (name, value) VALUES (?, ?)");
  stmt.run(name, value);
}
function isPasswordSetupComplete() {
  if (!db) {
    console.warn("Database not initialized when checking setup status.");
    return false;
  }
  try {
    const saltExists = getSetting("kdfSalt") !== null;
    const iterationsExist = getSetting("kdfIterations") !== null;
    const digestExists = getSetting("kdfDigest") !== null;
    const setupCompleteFlag = getSetting(SETUP_COMPLETE_SETTING_NAME) === "true";
    const verificationBlockExists = getSetting("verificationBlockEncrypted") !== null;
    return saltExists && iterationsExist && digestExists && setupCompleteFlag && verificationBlockExists;
  } catch (error) {
    console.error("Error checking password setup status:", error);
    return false;
  }
}
function getPasswordSetupParameters() {
  if (!db) {
    console.error("Database not initialized when getting password parameters.");
    return null;
  }
  try {
    const saltHex = getSetting("kdfSalt");
    const iterationsStr = getSetting("kdfIterations");
    const digest = getSetting("kdfDigest");
    if (saltHex && iterationsStr && digest) {
      return {
        salt: Buffer.from(saltHex, "hex"),
        // Соль хранится как hex строка
        iterations: Number(iterationsStr),
        // Итерации хранятся как строка числа
        digest
        // Дайджест хранится как строка
      };
    }
    return null;
  } catch (error) {
    console.error("Error getting password setup parameters from DB:", error);
    return null;
  }
}
function encryptData(data, key) {
  const iv = nc.randomBytes(IV_LENGTH);
  const cipher = nc.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(data, "utf8", "hex");
  encrypted += cipher.final("hex");
  return {
    encryptedData: encrypted,
    iv: iv.toString("hex")
  };
}
function decryptData(encryptedData, iv, key) {
  const ivBuffer = Buffer.from(iv, "hex");
  const decipher = nc.createDecipheriv(ALGORITHM, key, ivBuffer);
  let decrypted = decipher.update(encryptedData, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
function deriveEncryptionKey(password, salt, iterations, digest) {
  return new Promise((resolve, reject) => {
    nc.pbkdf2(password, salt, iterations, KEY_LENGTH, digest, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}
async function completePasswordSetup(password) {
  if (!db) {
    throw new Error("Database not initialized.");
  }
  if (isPasswordSetupComplete()) {
    console.warn("Password setup already complete.");
    return;
  }
  try {
    const salt = nc.randomBytes(SALT_STORAGE_LENGTH);
    const masterKey = await deriveEncryptionKey(password, salt, ITERATIONS, DIGEST);
    const verificationBlock = VERIFICATION_BLOCK_VALUE;
    const encryptedVerificationBlock = encryptData(verificationBlock, masterKey);
    setSetting("kdfSalt", salt.toString("hex"));
    setSetting("kdfIterations", String(ITERATIONS));
    setSetting("kdfDigest", DIGEST);
    setSetting("verificationBlockEncrypted", encryptedVerificationBlock.encryptedData);
    setSetting("verificationBlockIv", encryptedVerificationBlock.iv);
    setSetting(SETUP_COMPLETE_SETTING_NAME, "true");
    console.log("Password setup parameters and verification block saved.");
  } catch (error) {
    console.error("Error completing password setup:", error);
    throw new Error(`Failed to complete password setup: ${error.message || error}`);
  }
}
async function verifyPassword(password) {
  if (!db) {
    throw new Error("Database not initialized.");
  }
  if (!isPasswordSetupComplete()) {
    throw new Error("Password setup not complete. Please setup a password.");
  }
  try {
    const params = getPasswordSetupParameters();
    const encryptedBlock = getSetting("verificationBlockEncrypted");
    const iv = getSetting("verificationBlockIv");
    if (!params || !encryptedBlock || !iv) {
      throw new Error("Verification data not found. Password setup incomplete?");
    }
    const potentialKey = await deriveEncryptionKey(password, params.salt, params.iterations, params.digest);
    const decryptedBlock = decryptData(encryptedBlock, iv, potentialKey);
    if (decryptedBlock === VERIFICATION_BLOCK_VALUE) {
      console.log("Password verification successful.");
      return true;
    } else {
      console.warn("Password verification failed. Decrypted block mismatch.");
      return false;
    }
  } catch (error) {
    console.error("Technical error during password verification:", error);
    return false;
  }
}
let masterEncryptionKey = null;
async function unlockStorage(password) {
  const params = getPasswordSetupParameters();
  if (!params) {
    throw new Error("Password setup parameters not found.");
  }
  const isVerified = await verifyPassword(password);
  if (!isVerified) {
    throw new Error("Incorrect password.");
  }
  try {
    const key = await deriveEncryptionKey(password, params.salt, params.iterations, params.digest);
    masterEncryptionKey = key;
    console.log("Storage unlocked. Master encryption key loaded.");
  } catch (error) {
    masterEncryptionKey = null;
    console.error("Failed to unlock storage:", error);
    throw new Error("Failed to unlock storage after verification.");
  }
}
function lockStorage() {
  masterEncryptionKey = null;
  console.log("Storage locked. Master encryption key removed from memory.");
}
function getMasterEncryptionKey() {
  return masterEncryptionKey;
}
async function getWalletsListForFrontend() {
  if (!db) {
    console.warn("Database not initialized when fetching wallet list.");
    return [];
  }
  try {
    const rows = db.prepare("SELECT id, name, address, withdrawal FROM wallets WHERE network = ?").all(Kiwi.network);
    const wallets = rows.map((row) => ({
      id: row.id,
      name: row.name,
      address: row.address,
      withdrawal: row.withdrawal
    }));
    console.log(`Workspaceed ${wallets.length} wallets from DB for frontend list.`);
    return wallets;
  } catch (error) {
    console.error("Error fetching wallet list from database:", error);
    throw new Error(`Failed to load wallet list: ${error.message || error}`);
  }
}
async function createAndSaveWallet(network, name) {
  const masterKey = getMasterEncryptionKey();
  if (!masterKey) {
    console.warn("Attempted to create wallet while storage is locked.");
    throw new Error("Storage is locked. Please log in to create a wallet.");
  }
  if (!db) {
    throw new Error("Database not initialized. Cannot save wallet.");
  }
  try {
    console.log(`Starting wallet creation process for network: ${network}`);
    const wallet = await generateKeys();
    const dbNetwork = Kiwi.network;
    const address = wallet.receiveAddress;
    const receivePrivateKeyString = wallet.receivePrivateKey;
    const encryptedReceivePrivateKey = encryptData(receivePrivateKeyString, masterKey);
    console.log("Private keys encrypted.");
    const insertStmt = db.prepare("INSERT INTO wallets (name, address, encryptedReceivePrivateKey, receiveIv, network) VALUES (?, ?, ?, ?, ?)");
    let finalName;
    if (name && name.trim() !== "") {
      finalName = name.trim();
      console.log(`Using provided wallet name: "${finalName}"`);
    } else {
      console.log("Generating default wallet name in 'wN' format...");
      let maxNumber = 0;
      try {
        const existingNames = db.prepare("SELECT name FROM wallets").all();
        const nameRegex = /^w(\d+)$/;
        for (const row of existingNames) {
          const match = row.name.match(nameRegex);
          if (match && match[1]) {
            const number = parseInt(match[1], 10);
            if (!isNaN(number)) {
              maxNumber = Math.max(maxNumber, number);
            }
          }
        }
        console.log(`Highest existing 'wN' number found: ${maxNumber}`);
      } catch (dbError) {
        console.error("Error querying existing wallet names for default naming:", dbError);
        maxNumber = 0;
      }
      const nextNumber = maxNumber + 1;
      finalName = `w${nextNumber}`;
      console.log(`Generated default wallet name: "${finalName}"`);
    }
    const info = insertStmt.run(finalName, wallet.receiveAddress, encryptedReceivePrivateKey.encryptedData, encryptedReceivePrivateKey.iv, dbNetwork);
    const newWalletId = info.lastInsertRowid;
    console.log(`Wallet saved to database with ID: ${newWalletId}`);
    return {
      id: Number(newWalletId),
      name: finalName,
      address: wallet.receiveAddress
    };
  } catch (error) {
    console.error("Error during wallet creation and saving:", error);
    throw new Error(`Failed to create and save wallet: ${error.message || error}`);
  }
}
async function importAndSaveWallet(key, name) {
  const masterKey = getMasterEncryptionKey();
  if (!masterKey) {
    console.warn("Attempted to import wallet while storage is locked.");
    throw new Error("Storage is locked. Please log in to import a wallet.");
  }
  if (!db) {
    throw new Error("Database not initialized. Cannot save wallet.");
  }
  const dbNetwork = Kiwi.network;
  console.log(`DEBUG_INPUT: Raw key from IPC: "${key}" (length: ${key.length})`);
  try {
    console.log("Attempting to import as Mnemonic...");
    const wallet = Wallet.fromMnemonic(key);
    console.log("Successfully imported as Mnemonic.");
    const address = wallet.toAddress(dbNetwork);
    const privateKey = wallet.toPrivateKey();
    const encryptedReceivePrivateKey = encryptData(privateKey, masterKey);
    const insertStmt = db.prepare("INSERT INTO wallets (name, address, encryptedReceivePrivateKey, receiveIv, network) VALUES (?, ?, ?, ?, ?)");
    const info = insertStmt.run(name, address, encryptedReceivePrivateKey.encryptedData, encryptedReceivePrivateKey.iv, dbNetwork);
    const newWalletId = info.lastInsertRowid;
    return {
      // <-- ГАРАНТИРОВАННЫЙ ВОЗВРАТ ПРИ УСПЕХЕ МНЕМОНИКИ
      id: Number(newWalletId),
      name,
      address
    };
  } catch (mnemonicError) {
    console.warn(`Mnemonic import failed: ${mnemonicError && mnemonicError.message ? mnemonicError.message : mnemonicError}. Attempting to import as Private Key...`);
    try {
      const wallet = Wallet.fromPrivateKey(key);
      const address = wallet.toAddress(dbNetwork).toString();
      console.log(address);
      const encryptedReceivePrivateKey = encryptData(key, masterKey);
      const insertStmt = db.prepare("INSERT INTO wallets (name, address, encryptedReceivePrivateKey, receiveIv, network) VALUES (?, ?, ?, ?, ?)");
      const info = insertStmt.run(name, address, encryptedReceivePrivateKey.encryptedData, encryptedReceivePrivateKey.iv, dbNetwork);
      const newWalletId = info.lastInsertRowid;
      return {
        // <-- ГАРАНТИРОВАННЫЙ ВОЗВРАТ ПРИ УСПЕХЕ ПРИВАТНОГО КЛЮЧА
        id: Number(newWalletId),
        name,
        address
      };
    } catch (privateKeyError) {
      console.error(`Private Key import also failed: ${privateKeyError && privateKeyError.message ? privateKeyError.message : privateKeyError}. Neither format recognized.`);
      throw new Error("Invalid key format. Please enter a valid mnemonic phrase or private key.");
    }
  }
}
async function deleteWallet(address) {
  const masterKey = getMasterEncryptionKey();
  if (!masterKey) {
    console.warn("Attempted to import wallet while storage is locked.");
    throw new Error("Storage is locked. Please log in to import a wallet.");
  }
  if (!db) {
    throw new Error("Database not initialized. Cannot save wallet.");
  }
  try {
    const query = `DELETE FROM wallets WHERE address = ?`;
    const stmt = db.prepare(query);
    const result = stmt.run(address);
    return result.changes;
  } catch (error) {
    console.error(`Error deleting wallets with IDs address`, error);
    throw new Error(`Failed to delete wallets: ${error.message || String(error)}`);
  }
}
async function addAndSaveWallet(key, name) {
  if (!db) {
    throw new Error("Database not initialized. Cannot save wallet.");
  }
  const dbNetwork = Kiwi.network;
  console.log(`DEBUG_INPUT: Raw key from IPC: "${key}" (length: ${key.length})`);
  try {
    console.log("Attempting to import as Mnemonic...");
    console.log("Successfully imported as Mnemonic.");
    const address = key;
    const insertStmt = db.prepare("INSERT INTO wallets (name, address, network, withdrawal) VALUES (?, ?, ?, ?)");
    const info = insertStmt.run(name, address, dbNetwork, 1);
    const newWalletId = info.lastInsertRowid;
    return {
      // <-- ГАРАНТИРОВАННЫЙ ВОЗВРАТ ПРИ УСПЕХЕ МНЕМОНИКИ
      id: Number(newWalletId),
      name,
      address,
      withdrawal: 1
    };
  } catch (mnemonicError) {
    throw new Error("Invalid addressformat. Please enter a valid address.");
  }
}
async function renameWallet(address, newName) {
  const masterKey = getMasterEncryptionKey();
  if (!masterKey) {
    console.warn("Attempted to rename wallet while storage is locked.");
    throw new Error("Storage is locked. Please log in to rename a wallet.");
  }
  if (!db) {
    throw new Error("Database not initialized. Cannot rename wallet.");
  }
  try {
    console.log(`Attempting to rename wallet ${address} to ${newName}`);
    const stmt = db.prepare("UPDATE wallets SET name = ? WHERE address = ?");
    const result = stmt.run(newName, address);
    if (result.changes > 0) {
      console.log(`Wallet ${address} successfully renamed to ${newName}.`);
      return true;
    } else {
      console.warn(`Wallet ${address} not found or name is already ${newName}.`);
      return false;
    }
  } catch (error) {
    console.error(`Error renaming wallet ${address}:`, error);
    throw new Error(`Failed to rename wallet: ${error.message || String(error)}`);
  }
}
function formatTokenBalance(rawBalance, decimals, fixedDecimals = 2) {
  const num = typeof rawBalance === "string" ? BigInt(rawBalance) : BigInt(rawBalance);
  const divisor = BigInt(10) ** BigInt(decimals);
  const integerPart = num / divisor;
  const fractionalPart = num % divisor;
  let fractionalString = fractionalPart.toString().padStart(decimals, "0");
  if (fixedDecimals < decimals) {
    fractionalString = fractionalString.substring(0, fixedDecimals);
  }
  const fullNumberString = `${integerPart}.${fractionalString}`;
  const numberForFormatting = parseFloat(fullNumberString);
  if (isNaN(numberForFormatting)) {
    console.warn(`Failed to parse number for formatting: ${fullNumberString}`);
    return String(rawBalance);
  }
  const formatter = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: fixedDecimals,
    maximumFractionDigits: fixedDecimals,
    useGrouping: true
    // Включаем разделители тысяч
  });
  return formatter.format(numberForFormatting);
}
async function getPrivateKeys(addresses) {
  const masterKey = getMasterEncryptionKey();
  if (!masterKey) {
    console.warn("Attempted to retrieve private keys while storage is locked.");
    throw new Error("Storage is locked. Please log in to access wallet data.");
  }
  if (!db) {
    throw new Error("Database not initialized.");
  }
  const privateKeysMap = /* @__PURE__ */ new Map();
  if (addresses.length === 0) {
    return privateKeysMap;
  }
  try {
    const placeholders = addresses.map(() => "?").join(",");
    const query = `SELECT address, encryptedReceivePrivateKey, receiveIv FROM wallets WHERE address IN (${placeholders})`;
    const stmt = db.prepare(query);
    const rows = stmt.all(...addresses);
    for (const row of rows) {
      try {
        const decryptedPrivateKey = decryptData(row.encryptedReceivePrivateKey, row.receiveIv, masterKey);
        privateKeysMap.set(row.address, decryptedPrivateKey);
      } catch (decryptionError) {
        console.error(`Error decrypting private key for address ${row.address}: ${decryptionError.message}`);
      }
    }
    if (privateKeysMap.size !== addresses.length) {
      const missingAddresses = addresses.filter((addr) => !privateKeysMap.has(addr));
      console.warn(`Could not find private keys for the following addresses: ${missingAddresses.join(", ")}`);
    }
    console.log(`Successfully retrieved and decrypted ${privateKeysMap.size} private keys.`);
    return privateKeysMap;
  } catch (error) {
    console.error(`Error fetching private keys for addresses:`, error);
    throw new Error(`Failed to retrieve private keys for selected wallets: ${error.message || error}`);
  }
}
const require$1 = createRequire(import.meta.url);
const { sompiToKaspaString: sompiToKaspaString$1 } = require$1("../wasm/kaspa");
async function getBalancesForAddresses(addresses) {
  const balanceMap = {};
  if (addresses.length === 0) {
    console.log("No addresses provided to getBalancesForAddresses. Returning empty object.");
    return balanceMap;
  }
  const balancePromises = addresses.map(async (address) => {
    try {
      const result = await KaspaApi.getBalance(address);
      if (result && result.address === address && result.balance !== void 0) {
        return { address: result.address, balance: result.balance };
      } else {
        console.warn(`RPC Service: Unexpected result structure for address ${address}:`, result);
        return { address, error: "Invalid response" };
      }
    } catch (error) {
      console.warn(`RPC Service: Failed to fetch balance for address ${address}: ${error.message || error}`);
      return { address, error: "Unavailable" };
    }
  });
  try {
    const results = await Promise.allSettled(balancePromises);
    results.forEach((settledResult) => {
      if (settledResult.status === "fulfilled") {
        const resultValue = settledResult.value;
        if (resultValue && resultValue.address) {
          if (resultValue.balance !== void 0) {
            balanceMap[resultValue.address] = typeof resultValue.balance === "object" && resultValue.balance !== null && "toString" in resultValue.balance ? resultValue.balance.toString() : sompiToKaspaString$1(resultValue.balance);
          } else {
            balanceMap[resultValue.address] = resultValue.error || "Unavailable";
          }
        } else {
          console.error("Received fulfilled result without a valid address:", resultValue);
        }
      }
    });
    console.log(`RPC Service: Finished fetching balances and building map for ${Object.keys(balanceMap).length} addresses.`);
    return balanceMap;
  } catch (error) {
    console.error(`RPC Service: Critical error in getBalancesForAddresses processing: ${error.message || error}`);
    addresses.forEach((address) => {
      balanceMap[address] = "Unavailable (Batch Error)";
    });
    return balanceMap;
  }
}
const require2 = createRequire(import.meta.url);
const { sompiToKaspaString } = require2("../wasm/kaspa");
async function getTokensForAddresses(addresses) {
  const allTokensMap = /* @__PURE__ */ new Map();
  if (addresses.length === 0) {
    console.log("No addresses provided to getKaspaWalletTokensForAddresses. Returning empty map.");
    return allTokensMap;
  }
  const tokenPromises = addresses.map(async (address) => {
    let addressTokens = [];
    let errorFetchingTokens = null;
    try {
      const response = await KasplexApi.getAddressTokenList(address);
      console.log("RPC Service: KasplexApi.getAddressTokenList response:", JSON.stringify(response));
      if (response.message === "successful" && Array.isArray(response.result)) {
        addressTokens = response.result.map((item) => {
          const decimals = parseInt(item.dec || "8", 10);
          const formattedBalance = formatTokenBalance(item.balance, decimals, 2);
          return {
            value: item.tick || item.ca || "",
            // Используем tick или ca как value
            label: item.tick || "Unknown Token",
            // Отображаемое имя
            balance: formattedBalance,
            decimals: isNaN(decimals) ? 8 : decimals
          };
        }).filter((token) => token.value !== "");
      } else {
        console.warn(`RPC Service: KasplexApi.getAddressTokenList returned unsuccessful message or invalid result for ${address}:`, response);
        errorFetchingTokens = `Invalid response for address ${address}`;
      }
    } catch (error) {
      console.error(`RPC Service: Failed to fetch tokens for address ${address}: ${error.message || String(error)}`);
      errorFetchingTokens = `Failed to fetch tokens for address ${address}: ${error.message || String(error)}`;
    }
    let kaspaBalanceToken = null;
    try {
      const kaspaBalancesMap = await getBalancesForAddresses([address]);
      const kaspaBalance = kaspaBalancesMap[address];
      if (kaspaBalance && kaspaBalance !== "Unavailable" && !kaspaBalance.startsWith("Unavailable")) {
        kaspaBalanceToken = {
          value: "Kaspa",
          label: "Kaspa",
          balance: kaspaBalance,
          decimals: 8
        };
      }
    } catch (error) {
      console.error(`RPC Service: Failed to fetch KAS balance for address ${address}: ${error.message || String(error)}`);
    }
    if (kaspaBalanceToken && !addressTokens.some((token) => token.value.toUpperCase() === "KAS")) {
      addressTokens.unshift(kaspaBalanceToken);
    }
    return { address, tokens: addressTokens, error: errorFetchingTokens };
  });
  try {
    const results = await Promise.allSettled(tokenPromises);
    results.forEach((settledResult) => {
      if (settledResult.status === "fulfilled") {
        const { address, tokens, error } = settledResult.value;
        if (address) {
          if (error) {
            console.warn(`RPC Service: Partial failure for address ${address}: ${error}`);
            allTokensMap.set(address, []);
          } else {
            allTokensMap.set(address, tokens);
          }
        }
      } else {
        const reason = settledResult.reason;
        console.error(`RPC Service: Promise rejected for unknown address: ${reason}`);
      }
    });
    console.log(`RPC Service: Finished fetching all tokens for ${addresses.length} addresses. Map size: ${allTokensMap.size}.`);
    return allTokensMap;
  } catch (error) {
    console.error(`RPC Service: Critical error in getKaspaWalletTokensForAddresses processing: ${error.message || String(error)}`);
    addresses.forEach((address) => {
      allTokensMap.set(address, []);
    });
    return allTokensMap;
  }
}
async function sendKaspaSingleToSingle(senderPrivateKey, recipientDetails, feeInSompi) {
  try {
    await Rpc.setInstance(Kiwi.network).connect();
    let privateKey;
    try {
      privateKey = new Wasm.PrivateKey(senderPrivateKey);
    } catch (e) {
      console.error("KaspaTransactionService: Ошибка при создании PrivateKey из строки:", e);
      throw new Error("Неверный формат приватного ключа для транзакции KAS.");
    }
    const recipientOutput = recipientDetails[0];
    const amountInSompi = Wasm.kaspaToSompi(recipientOutput.amount);
    if (typeof amountInSompi !== "bigint") {
      throw new Error(`Не удалось преобразовать сумму получателя '${recipientOutput.amount}' в Sompi. Проверьте формат.`);
    }
    if (amountInSompi <= 0) {
      throw new Error(`Неверная сумма получателя: ${recipientOutput.amount}. Сумма должна быть положительным числом.`);
    }
    const outputsForTransfer = [
      {
        address: recipientOutput.address,
        amount: amountInSompi
      }
    ];
    const txid = await KaspaTransaction.transfer(privateKey, outputsForTransfer, feeInSompi);
    return txid;
  } catch (error) {
    console.error(`KaspaTransactionService: Не удалось отправить транзакцию KAS (SingleToSingle): ${error.message || error}`);
    throw new Error(`Не удалось отправить транзакцию KAS (SingleToSingle): ${error.message || "Неизвестная ошибка"}`);
  }
}
async function sendKaspaSingleToMultiple(senderPrivateKey, recipientDetails, feeInSompi) {
  if (!senderPrivateKey) {
    throw new Error("Приватный ключ отправителя не может быть пустым.");
  }
  if (!recipientDetails || recipientDetails.length === 0) {
    throw new Error("Не указаны данные получателя для транзакции (SingleToMultiple).");
  }
  const txids = [];
  try {
    await Rpc.setInstance(Kiwi.network).connect();
    console.log("KaspaTransactionService: Успешно подключено к RPC.");
    let privateKey;
    try {
      privateKey = new Wasm.PrivateKey(senderPrivateKey);
    } catch (e) {
      console.error("KaspaTransactionService: Ошибка при создании PrivateKey из строки:", e.message || e);
      throw new Error("Неверный формат приватного ключа для транзакции KAS.");
    }
    const BATCH_SIZE2 = 2;
    for (let i = 0; i < recipientDetails.length; i += BATCH_SIZE2) {
      const batch = recipientDetails.slice(i, i + BATCH_SIZE2);
      const outputsForBatch = [];
      for (const detail of batch) {
        const amountInSompi = Wasm.kaspaToSompi(detail.amount);
        if (typeof amountInSompi !== "bigint") {
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
        txids.push(batchTxid);
        await new Promise((resolve) => setTimeout(resolve, 1500));
        console.log(`KaspaTransactionService: Партия KAS транзакций успешно отправлена. TXID: ${batchTxid}`);
      } catch (batchError) {
        console.error(`KaspaTransactionService: Не удалось отправить партию KAS транзакций (SingleToMultiple) для партии, начинающейся с ${batch[0].address}: ${batchError.message || batchError}`);
        throw new Error(`Не удалось отправить партию KAS транзакций (SingleToMultiple): ${batchError.message || "Неизвестная ошибка"}`);
      }
    }
    return txids;
  } catch (error) {
    console.error(`KaspaTransactionService: Не удалось отправить KAS транзакции (SingleToMultiple): ${error.message || error}`);
    throw new Error(`Не удалось отправить KAS транзакции (SingleToMultiple): ${error.message || "Неизвестная ошибка"}`);
  }
}
async function sendKaspaMultipleToSingle(senderAddresses, privateKeysMap, recipientAddress, amountPerWalletStr, feeInSompi) {
  if (!senderAddresses || senderAddresses.length === 0) {
    throw new Error("Необходимо указать хотя бы один адрес отправителя.");
  }
  if (!recipientAddress || !amountPerWalletStr) {
    throw new Error("Не указан адрес получателя или сумма для отправки.");
  }
  await Rpc.setInstance(Kiwi.network).connect();
  const amountPerWalletInSompi = Wasm.kaspaToSompi(amountPerWalletStr);
  if (typeof amountPerWalletInSompi !== "bigint" || amountPerWalletInSompi <= 0) {
    throw new Error(`Неверная сумма для отправки с каждого кошелька: ${amountPerWalletStr}`);
  }
  const transactionPromises = senderAddresses.map(async (senderAddress) => {
    const senderPrivateKey = privateKeysMap.get(senderAddress);
    if (!senderPrivateKey) {
      return {
        senderAddress,
        status: "failed",
        error: "Приватный ключ не найден."
      };
    }
    try {
      const privateKey = new Wasm.PrivateKey(senderPrivateKey);
      const recipientDetails = [{ address: recipientAddress, amount: amountPerWalletInSompi }];
      const txid = await KaspaTransaction.transfer(privateKey, recipientDetails, feeInSompi);
      console.log(`Успешно отправлено ${amountPerWalletStr} KAS с ${senderAddress}. TXID: ${txid}`);
      return {
        senderAddress,
        status: "success",
        txid
      };
    } catch (error) {
      console.error(`Ошибка при отправке с ${senderAddress}: ${error.message}`);
      return {
        senderAddress,
        status: "failed",
        error: error.message || "Неизвестная ошибка транзакции."
      };
    }
  });
  return Promise.all(transactionPromises);
}
async function sendTokenSingleToSingle(senderPrivateKey, recipientDetails, feeInSompi, ticker) {
  if (!ticker) {
    throw new Error("Не указан тикер токена для отправки.");
  }
  if (!recipientDetails || !recipientDetails[0]) {
    throw new Error("Не указаны данные получателя.");
  }
  try {
    await Rpc.setInstance(Kiwi.network).connect();
    let privateKey;
    try {
      privateKey = new Wasm.PrivateKey(senderPrivateKey);
    } catch (e) {
      console.error("KaspaTransactionService: Ошибка при создании PrivateKey из строки:", e);
      throw new Error("Неверный формат приватного ключа для транзакции KAS.");
    }
    const recipient = recipientDetails[0];
    const amountInSmallestUnit = Wasm.kaspaToSompi(recipient.amount);
    if (typeof amountInSmallestUnit !== "bigint" || amountInSmallestUnit <= 0) {
      throw new Error(`Неверная или нулевая сумма токена: ${recipient.amount}`);
    }
    const krc20data = Utils.createKrc20Data({
      p: "krc-20",
      op: Enum.OP.Transfer,
      tick: ticker,
      to: recipient.address,
      amt: amountInSmallestUnit.toString()
      // Сумма токенов, не Sompi!
    });
    console.log(`Подготовка к отправке токена ${ticker}. Данные:`, krc20data);
    const txid = await KRC20.transfer(privateKey, krc20data, feeInSompi);
    console.log(`Транзакция токена ${ticker} успешно отправлена. TXID: ${txid}`);
    return txid;
  } catch (error) {
    console.error(`Service: Не удалось отправить токен ${ticker} (SingleToSingle): ${error.message || error}`);
    throw error;
  }
}
async function sendTokenSingleToMultiple(senderPrivateKey, recipientDetails, feeInSompi, ticker) {
  if (!ticker) {
    throw new Error("Не указан тикер токена для отправки.");
  }
  if (!recipientDetails || recipientDetails.length === 0) {
    throw new Error("Не указаны данные получателей.");
  }
  await Rpc.setInstance(Kiwi.network).connect();
  let privateKey;
  try {
    privateKey = new Wasm.PrivateKey(senderPrivateKey);
  } catch (e) {
    console.error("KaspaTransactionService: Ошибка при создании PrivateKey из строки:", e);
    throw new Error("Неверный формат приватного ключа для транзакции KAS.");
  }
  const createdTxids = [];
  for (const recipient of recipientDetails) {
    try {
      const amountInSmallestUnit = Wasm.kaspaToSompi(recipient.amount);
      if (typeof amountInSmallestUnit !== "bigint" || amountInSmallestUnit <= 0) {
        console.error(`Неверная сумма токена для ${recipient.address}: ${recipient.amount}. Пропускаем.`);
        continue;
      }
      const krc20data = Utils.createKrc20Data({
        p: "krc-20",
        op: Enum.OP.Transfer,
        tick: ticker,
        to: recipient.address,
        amt: amountInSmallestUnit.toString()
      });
      console.log(`Отправка ${recipient.amount} ${ticker} на адрес ${recipient.address}...`);
      const txid = await KRC20.transfer(privateKey, krc20data, feeInSompi);
      createdTxids.push(txid);
      console.log(`Успешно. TXID: ${txid}`);
      await new Promise((resolve) => setTimeout(resolve, 1e3));
    } catch (error) {
      console.error(`Service: Не удалось отправить токен ${ticker} на адрес ${recipient.address}: ${error.message}`);
      throw new Error(`Ошибка при отправке на ${recipient.address}: ${error.message}`);
    }
  }
  return createdTxids;
}
async function sendTokenMultipleToSingle(senderAddresses, privateKeysMap, recipientAddress, amountPerWalletStr, feeInSompi, ticker) {
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
  if (typeof amountInSmallestUnit !== "bigint" || amountInSmallestUnit <= 0) {
    throw new Error(`Неверная или нулевая сумма токена для отправки с каждого кошелька: ${amountPerWalletStr}`);
  }
  const amountToSendStr = amountInSmallestUnit.toString();
  const transactionPromises = senderAddresses.map(async (senderAddress) => {
    const senderPrivateKey = privateKeysMap.get(senderAddress);
    if (!senderPrivateKey) {
      return { senderAddress, status: "failed", error: "Приватный ключ не найден." };
    }
    let privateKey;
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
        amt: amountToSendStr
      });
      const txid = await KRC20.transfer(privateKey, krc20data, feeInSompi);
      console.log(`Успешно отправлено ${amountPerWalletStr} ${ticker} с ${senderAddress}. TXID: ${txid}`);
      return { senderAddress, status: "success", txid };
    } catch (error) {
      console.error(`Ошибка при отправке токена с ${senderAddress}: ${error.message}`);
      return { senderAddress, status: "failed", error: error.message || "Неизвестная ошибка." };
    }
  });
  return Promise.all(transactionPromises);
}
const DEPLOY_FEE_KAS = 1e3;
const SERVICE_FEE_KAS = 1;
const TOTAL_FEE_KAS = DEPLOY_FEE_KAS + SERVICE_FEE_KAS;
async function checkTickerAvailability(ticker) {
  var _a, _b;
  if (!ticker || !/^[A-Z]{4,6}$/.test(ticker)) {
    throw new Error("Invalid ticker format. Must be 4-6 uppercase letters.");
  }
  await Rpc.setInstance(Kiwi.network).connect();
  try {
    const tokenInfo = await KasplexApi.getToken(ticker);
    return ((_b = (_a = tokenInfo == null ? void 0 : tokenInfo.result) == null ? void 0 : _a[0]) == null ? void 0 : _b.state) === "unused";
  } finally {
    await Rpc.getInstance().disconnect();
  }
}
async function deployKrc20Token(args) {
  const { walletAddress, ticker, maxSupply, mintLimit, preAllocationAmount, decimals } = args;
  if (!/^[A-Z]{4,6}$/.test(ticker)) {
    throw new Error("Ticker must be 4-6 uppercase English letters.");
  }
  await Rpc.setInstance(Kiwi.network).connect();
  const tokenInfo = await KasplexApi.getToken(ticker);
  if (tokenInfo && tokenInfo.result && tokenInfo.result[0].state !== "unused") {
    throw new Error(`Token with ticker "${ticker}" already exists or is reserved.`);
  }
  const balances = await getBalancesForAddresses([walletAddress]);
  const walletBalanceStr = balances[walletAddress];
  if (!walletBalanceStr) {
    throw new Error(`Could not retrieve balance for wallet ${walletAddress}.`);
  }
  const cleanBalanceStr = walletBalanceStr.replace(/,/g, "");
  const walletBalanceNum = parseFloat(cleanBalanceStr);
  if (isNaN(walletBalanceNum) || walletBalanceNum < TOTAL_FEE_KAS) {
    throw new Error(`Insufficient KAS balance. Need at least ${TOTAL_FEE_KAS} KAS for fees. Current balance: ${walletBalanceStr} KAS.`);
  }
  const maxInBaseUnits = Wasm.kaspaToSompi(maxSupply).toString();
  const limInBaseUnits = Wasm.kaspaToSompi(mintLimit).toString();
  let preInBaseUnits = "";
  if (preAllocationAmount && preAllocationAmount.trim() !== "") {
    const preAmountBigInt = Wasm.kaspaToSompi(preAllocationAmount);
    if (preAmountBigInt <= 0n) {
      throw new Error("Pre-allocation amount, if provided, must be a positive number.");
    }
    if (preAmountBigInt > BigInt(maxInBaseUnits)) {
      throw new Error("Pre-allocation amount cannot be greater than Max Supply.");
    }
    preInBaseUnits = preAmountBigInt.toString();
  }
  const privateKeysMap = await getPrivateKeys([walletAddress]);
  const privateKeyStr = privateKeysMap.get(walletAddress);
  if (!privateKeyStr) {
    throw new Error("Private key for the selected wallet could not be retrieved.");
  }
  const privateKey = new Wasm.PrivateKey(privateKeyStr);
  const deployData = Utils.createKrc20Data({
    p: "krc-20",
    op: Enum.OP.Deploy,
    tick: ticker,
    to: walletAddress,
    // Pre-allocation amount (if any) is sent to the deployer's address
    max: maxInBaseUnits,
    // <--- Используем конвертированное значение
    lim: limInBaseUnits,
    // <--- Используем конвертированное значение
    pre: preInBaseUnits,
    dec: decimals || "8",
    // По умолчанию 8, как в большинстве токенов
    amt: ""
    // Для операции deploy поле amt должно быть пустым
  });
  console.log("Deploying KRC-20 token with data:", deployData);
  const txid = await KRC20.deploy(privateKey, deployData);
  console.log(`Token ${ticker} deployed successfully. TXID: ${txid}`);
  await Rpc.getInstance().disconnect();
  return txid;
}
const version = "2.30.6";
let errorConfig = {
  getDocsUrl: ({ docsBaseUrl, docsPath = "", docsSlug }) => docsPath ? `${docsBaseUrl ?? "https://viem.sh"}${docsPath}${docsSlug ? `#${docsSlug}` : ""}` : void 0,
  version: `viem@${version}`
};
class BaseError extends Error {
  constructor(shortMessage, args = {}) {
    var _a;
    const details = (() => {
      var _a2;
      if (args.cause instanceof BaseError)
        return args.cause.details;
      if ((_a2 = args.cause) == null ? void 0 : _a2.message)
        return args.cause.message;
      return args.details;
    })();
    const docsPath = (() => {
      if (args.cause instanceof BaseError)
        return args.cause.docsPath || args.docsPath;
      return args.docsPath;
    })();
    const docsUrl = (_a = errorConfig.getDocsUrl) == null ? void 0 : _a.call(errorConfig, { ...args, docsPath });
    const message = [
      shortMessage || "An error occurred.",
      "",
      ...args.metaMessages ? [...args.metaMessages, ""] : [],
      ...docsUrl ? [`Docs: ${docsUrl}`] : [],
      ...details ? [`Details: ${details}`] : [],
      ...errorConfig.version ? [`Version: ${errorConfig.version}`] : []
    ].join("\n");
    super(message, args.cause ? { cause: args.cause } : void 0);
    Object.defineProperty(this, "details", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "docsPath", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "metaMessages", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "shortMessage", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "version", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: void 0
    });
    Object.defineProperty(this, "name", {
      enumerable: true,
      configurable: true,
      writable: true,
      value: "BaseError"
    });
    this.details = details;
    this.docsPath = docsPath;
    this.metaMessages = args.metaMessages;
    this.name = args.name ?? this.name;
    this.shortMessage = shortMessage;
    this.version = version;
  }
  walk(fn) {
    return walk(this, fn);
  }
}
function walk(err, fn) {
  if (fn == null ? void 0 : fn(err))
    return err;
  if (err && typeof err === "object" && "cause" in err && err.cause !== void 0)
    return walk(err.cause, fn);
  return fn ? null : err;
}
class InvalidDecimalNumberError extends BaseError {
  constructor({ value }) {
    super(`Number \`${value}\` is not a valid decimal number.`, {
      name: "InvalidDecimalNumberError"
    });
  }
}
function parseUnits(value, decimals) {
  if (!/^(-?)([0-9]*)\.?([0-9]*)$/.test(value))
    throw new InvalidDecimalNumberError({ value });
  let [integer, fraction = "0"] = value.split(".");
  const negative = integer.startsWith("-");
  if (negative)
    integer = integer.slice(1);
  fraction = fraction.replace(/(0+)$/, "");
  if (decimals === 0) {
    if (Math.round(Number(`.${fraction}`)) === 1)
      integer = `${BigInt(integer) + 1n}`;
    fraction = "";
  } else if (fraction.length > decimals) {
    const [left, unit, right] = [
      fraction.slice(0, decimals - 1),
      fraction.slice(decimals - 1, decimals),
      fraction.slice(decimals)
    ];
    const rounded = Math.round(Number(`${unit}.${right}`));
    if (rounded > 9)
      fraction = `${BigInt(left) + BigInt(1)}0`.padStart(left.length + 1, "0");
    else
      fraction = `${left}${rounded}`;
    if (fraction.length > decimals) {
      fraction = fraction.slice(1);
      integer = `${BigInt(integer) + 1n}`;
    }
    fraction = fraction.slice(0, decimals);
  } else {
    fraction = fraction.padEnd(decimals, "0");
  }
  return BigInt(`${negative ? "-" : ""}${integer}${fraction}`);
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitForBalanceChange(address, ticker, decimals, initialBalance, timeoutMs = 12e4, pollIntervalMs = 1500) {
  const startTime = Date.now();
  console.log(`[Mint Service] Waiting for balance of "${ticker}" on address ${address.slice(0, 10)}... to exceed ${initialBalance}.`);
  while (Date.now() - startTime < timeoutMs) {
    await delay(pollIntervalMs);
    try {
      const response = await KasplexApi.getBalance(address, ticker);
      if (response.message === "successful" && response.result.length > 0) {
        const tokenData = response.result[0];
        const currentBalance = parseUnits(tokenData.balance, decimals);
        if (currentBalance > initialBalance) {
          console.log(`[Mint Service] Balance for "${ticker}" updated. New balance: ${currentBalance}`);
          return currentBalance;
        }
      }
    } catch (error) {
      console.warn(`[Mint Service] Polling for balance failed, will retry. Error: ${error.message}`);
    }
  }
  throw new Error(`Balance for "${ticker}" did not change within ${timeoutMs / 1e3} seconds.`);
}
const activeMintProcesses = /* @__PURE__ */ new Map();
const BATCH_SIZE = 3;
async function startMintProcess(params, onProgress) {
  const { processId, privateKey: privateKeyStr, ticker, mintTimes, feeInKas } = params;
  if (activeMintProcesses.has(processId)) {
    throw new Error(`Process ${processId} already running.`);
  }
  activeMintProcesses.set(processId, { isRunning: true });
  let totalMintsCompleted = 0;
  try {
    const _privateKey = new Wasm.PrivateKey(privateKeyStr);
    const fromAddress = _privateKey.toPublicKey().toAddress(Kiwi.network).toString();
    await Rpc.setInstance(Kiwi.network).connect();
    const krc20data = Utils.createKrc20Data({ p: "krc-20", op: Enum.OP.Mint, tick: ticker });
    const feeSompi = Wasm.kaspaToSompi(feeInKas);
    const tokenInfoResponse = await KasplexApi.getToken(ticker);
    if (tokenInfoResponse.message !== "successful" || !tokenInfoResponse.result[0]) {
      throw new Error(`Could not fetch info for ticker "${ticker}".`);
    }
    const tokenDecimals = parseInt(tokenInfoResponse.result[0].dec, 10);
    const initialBalanceResponse = await KasplexApi.getBalance(fromAddress, ticker);
    let lastKnownBalance = 0n;
    if (initialBalanceResponse.message === "successful" && initialBalanceResponse.result.length > 0) {
      lastKnownBalance = parseUnits(initialBalanceResponse.result[0].balance, tokenDecimals);
    }
    const totalBatches = Math.ceil(mintTimes / BATCH_SIZE);
    for (let i = 0; i < totalBatches; i++) {
      const processState = activeMintProcesses.get(processId);
      if (!processState || !processState.isRunning) {
        onProgress({ processId, currentIndex: totalMintsCompleted, total: mintTimes, txid: "N/A", status: "stopped", error: "Process stopped by user." });
        return;
      }
      const mintsInThisBatch = Math.min(BATCH_SIZE, mintTimes - totalMintsCompleted);
      if (mintsInThisBatch <= 0) break;
      let batchFirstTxid = "";
      await KRC20.multiMintWithReuseUtxo(
        _privateKey,
        krc20data,
        feeSompi,
        mintsInThisBatch,
        (index, txid) => {
          if (index === 1) batchFirstTxid = txid;
          onProgress({ processId, currentIndex: totalMintsCompleted + index, total: mintTimes, txid, status: "active" });
        }
      );
      totalMintsCompleted += mintsInThisBatch;
      onProgress({ processId, currentIndex: totalMintsCompleted, total: mintTimes, txid: batchFirstTxid, status: "confirming" });
      lastKnownBalance = await waitForBalanceChange(fromAddress, ticker, tokenDecimals, lastKnownBalance);
    }
    onProgress({ processId, currentIndex: mintTimes, total: mintTimes, txid: "N/A", status: "finished" });
  } catch (err) {
    onProgress({ processId, currentIndex: totalMintsCompleted, total: mintTimes, txid: "N/A", status: "error", error: err.message || "An unknown error occurred." });
  } finally {
    activeMintProcesses.delete(processId);
  }
}
function stopMintProcess(processId) {
  const processState = activeMintProcesses.get(processId);
  if (processState) {
    processState.isRunning = false;
    return true;
  }
  return false;
}
const __dirname = path__default.dirname(fileURLToPath(import.meta.url));
let currentNetwork = "Testnet";
let initialPasswordSetupStatus = false;
let win;
process.env.APP_ROOT = path__default.join(__dirname, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = path__default.join(process.env.APP_ROOT, "dist-electron");
const RENDERER_DIST = path__default.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path__default.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
function createWindow() {
  win = new BrowserWindow({
    icon: path__default.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    webPreferences: {
      preload: path__default.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.webContents.on("did-finish-load", () => {
    const initialState = initialPasswordSetupStatus ? "login" : "create-password";
    win == null ? void 0 : win.webContents.send("app-state-update", initialState);
    win == null ? void 0 : win.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path__default.join(RENDERER_DIST, "index.html"));
  }
}
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    lockStorage();
    app.quit();
    win = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
ipcMain.handle("set-network", async (event, network) => {
  currentNetwork = network;
  try {
    if (currentNetwork === "mainnet") {
      await Rpc.setInstance(Wasm.NetworkType.Testnet).disconnect();
      Kiwi.setNetwork(Wasm.NetworkType.Mainnet);
      await Rpc.setInstance(Wasm.NetworkType.Mainnet).connect();
    } else {
      await Rpc.setInstance(Wasm.NetworkType.Mainnet).disconnect();
      Kiwi.setNetwork(Wasm.NetworkType.Testnet);
      await Rpc.setInstance(Wasm.NetworkType.Testnet).connect();
    }
    console.log(`Successfully changed RPC network to ${currentNetwork} and reconnected.`);
  } catch (rpcChangeError) {
    console.error(`Error changing RPC network to ${currentNetwork} and reconnecting: ${rpcChangeError.message || rpcChangeError}`);
  }
  await fetchAndSendWalletsToRenderer(event.sender);
  return { success: true };
});
ipcMain.handle("get-initial-network", async () => {
  return 1;
});
ipcMain.handle("get-current-network", async () => {
  try {
    if (Kiwi.network === Wasm.NetworkType.Mainnet) {
      return { success: true, network: "Mainnet" };
    } else {
      return { success: true, network: "Testnet" };
    }
  } catch (error) {
    console.error("Error getting current network:", error);
    return { success: false, error: error.message || "Unknown error" };
  }
});
ipcMain.handle("create-password", async (event, password) => {
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
    event.sender.send("app-state-update", "dashboard");
    return { success: true };
  } catch (error) {
    console.error(`Error handling 'setup-password' IPC: ${error.message || error}`);
    throw new Error(`Failed to setup password: ${error.message || error}`);
  }
});
ipcMain.handle("login", async (event, password) => {
  console.log(`Received 'login' request.`);
  if (!password) {
    console.warn("Login attempt with empty password.");
    throw new Error("Password cannot be empty.");
  }
  if (!isPasswordSetupComplete()) {
    console.warn("Login attempted before password setup.");
    throw new Error("Password setup not complete. Please setup a password first.");
  }
  try {
    await unlockStorage(password);
    console.log("Storage unlocked successfully via login.");
    event.sender.send("app-state-update", "dashboard");
    await fetchAndSendWalletsToRenderer(event.sender);
    console.log("Sent 'app-state-update' to 'dashboard' after successful login.");
    return { success: true };
  } catch (error) {
    console.error(`Error handling 'login' IPC: ${error.message || error}`);
    throw new Error(`Login failed: ${error.message || "Unknown error"}`);
  }
});
ipcMain.handle("get-wallets", async (event) => {
  console.log(`Received 'get-wallets' request.`);
  return fetchAndSendWalletsToRenderer(event.sender);
});
ipcMain.handle("get-private-keys", async (event, addresses) => {
  try {
    const privateKeys = await getPrivateKeys(addresses);
    return Array.from(privateKeys.entries());
  } catch (error) {
    console.error(`IPC Handler Error:`, error);
    throw new Error(`Failed to get private keys: ${error.message}`);
  }
});
ipcMain.handle("create-wallet", async (event, name) => {
  console.log(`Received 'create-wallet' request${name ? ` with name: ${name}` : ""}.`);
  const masterKey = getMasterEncryptionKey();
  if (!masterKey) {
    console.warn("Wallet creation attempt failed: Storage locked.");
    throw new Error("Storage is locked. Please log in to create a wallet.");
  }
  try {
    const newWalletInfo = await createAndSaveWallet(Kiwi.network, name);
    console.log(`New wallet created and saved: ID=${newWalletInfo.id}, Address=${newWalletInfo.address} for network: ${currentNetwork}.`);
    await fetchAndSendWalletsToRenderer(event.sender);
    return { success: true, newWalletId: String(newWalletInfo.id), newWalletAddress: newWalletInfo.address };
  } catch (error) {
    console.error(`Error handling 'create-wallet' IPC: ${error.message || error}`);
    throw new Error(`Failed to create wallet: ${error.message || error}`);
  }
});
ipcMain.handle("import-wallet", async (event, key, name) => {
  console.log(`Received 'create-wallet' request${name ? ` with name: ${name}` : ""}.`);
  const masterKey = getMasterEncryptionKey();
  if (!masterKey) {
    console.warn("Wallet creation attempt failed: Storage locked.");
    throw new Error("Storage is locked. Please log in to create a wallet.");
  }
  try {
    const newWalletInfo = await importAndSaveWallet(key, name);
    console.log(`New wallet created and saved: ID=${newWalletInfo.id}, Address=${newWalletInfo.address} for network: ${currentNetwork}.`);
    await fetchAndSendWalletsToRenderer(event.sender);
    return { success: true, newWalletId: String(newWalletInfo.id), newWalletAddress: newWalletInfo.address };
  } catch (error) {
    console.error(`Error handling 'import-wallet' IPC: ${error.message || error}`);
    return { success: false, error: `Failed to import wallet: ${error.message || error}` };
  }
});
ipcMain.handle("delete-wallet", async (event, address) => {
  console.log(`Main: Received 'delete-wallet' request for address: ${address}`);
  const masterKey = getMasterEncryptionKey();
  if (!masterKey) {
    throw new Error("Storage locked. Cannot delete wallet.");
  }
  if (address.trim() === "") {
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
  } catch (error) {
    console.error(`Main: Error handling 'delete-wallet' IPC for address ${address}: ${error.message || error}`);
    throw new Error(`Failed to delete wallet: ${error.message || error}`);
  }
});
ipcMain.handle("rename-wallet", async (event, address, newName) => {
  try {
    const success = await renameWallet(address, newName);
    if (success) {
      await fetchAndSendWalletsToRenderer(event.sender);
      return { success: true };
    } else {
      return { success: false, error: "Wallet not found or name unchanged." };
    }
  } catch (error) {
    console.error("Error handling 'rename-wallet' IPC:", error);
    return { success: false, error: error.message || "Unknown error" };
  }
});
ipcMain.handle("add-wallet", async (event, key, name) => {
  console.log(`Received 'create-wallet' request${name ? ` with name: ${name}` : ""}.`);
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
  } catch (error) {
    console.error(`Error handling 'add-wallet' IPC: ${error.message || error}`);
    return { success: false, error: `Failed to import wallet: ${error.message || error}` };
  }
});
ipcMain.handle("get-tokens-for-addresses", async (_event, addresses) => {
  try {
    console.log(`Main Process: Received request for Kaspa tokens for addresses:`, addresses);
    const tokensMap = await getTokensForAddresses(addresses);
    const tokensObject = Object.fromEntries(tokensMap.entries());
    console.log(`Main Process: Sending Kaspa tokens back to renderer:`, tokensObject);
    return tokensObject;
  } catch (error) {
    console.error(`Main Process: Error getting Kaspa tokens for multiple addresses: ${error.message || error}`);
    throw error;
  }
});
ipcMain.handle("send-funds", async (event, senderAddresses, recipientDetails, transactionType, ticker, fee) => {
  if (ticker !== "Kaspa") {
    try {
      const feeInSompi = Wasm.kaspaToSompi(fee);
      if (typeof feeInSompi !== "bigint" || feeInSompi < 0) {
        return { success: false, error: "Неверный формат или значение комиссии." };
      }
      const privateKeysMap = await getPrivateKeys(senderAddresses);
      if (privateKeysMap.size === 0) {
        return { success: false, error: "Для указанных адресов отправителей не найдено приватных ключей." };
      }
      const postTransactionActions = async () => {
        await new Promise((resolve) => setTimeout(resolve, 3500));
        await fetchAndSendWalletsToRenderer(event.sender);
      };
      switch (transactionType) {
        case "singleToSingle": {
          if (senderAddresses.length === 0 || !senderAddresses[0]) {
            return { success: false, error: "Не указан адрес отправителя для транзакции SingleToSingle." };
          }
          if (recipientDetails.length === 0 || !recipientDetails[0]) {
            return { success: false, error: "Не указан адрес или сумма получателя для транзакции SingleToSingle." };
          }
          const senderPrivateKey = privateKeysMap.get(senderAddresses[0]);
          if (!senderPrivateKey) {
            return { success: false, error: `Приватный ключ для адреса отправителя ${senderAddresses[0]} не найден.` };
          }
          const txid = await sendTokenSingleToSingle(
            senderPrivateKey,
            recipientDetails,
            feeInSompi,
            ticker
          );
          await postTransactionActions();
          return { success: true, txid };
        }
        case "singleToMultiple": {
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
            senderPrivateKey,
            recipientDetails,
            feeInSompi,
            ticker
          );
          await postTransactionActions();
          return { success: true, txids };
        }
        case "multipleToSingle": {
          if (recipientDetails.length !== 1 || !recipientDetails[0].amount) {
            return { success: false, error: "Для этого типа транзакции требуется один получатель и сумма, отправляемая с КАЖДОГО кошелька." };
          }
          if (senderAddresses.length === 0) {
            return { success: false, error: "Выберите хотя бы один кошелек-отправитель." };
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
          const successfulTxs = results.filter((r) => r.status === "success");
          const failedTxs = results.filter((r) => r.status === "failed");
          if (failedTxs.length > 0) {
            return {
              success: false,
              error: `Операция завершена с ошибками. Успешно: ${successfulTxs.length}, с ошибкой: ${failedTxs.length}.`,
              details: results
              // Отправляем все детали на фронтенд для отображения
            };
          }
          return {
            success: true,
            txids: successfulTxs.map((r) => r.txid),
            // Возвращаем массив всех txid
            details: results
          };
        }
        default:
          return { success: false, error: "Неизвестный тип транзакции." };
      }
    } catch (error) {
      console.error(`Ошибка при отправке токена ${ticker}: ${error.message}`);
      return { success: false, error: error.message || "Произошла неизвестная ошибка." };
    }
  } else {
    try {
      const feeInSompi = Wasm.kaspaToSompi(fee);
      if (typeof feeInSompi !== "bigint" || feeInSompi < 0) {
        return { success: false, error: "Неверный формат или значение комиссии." };
      }
      const privateKeysMap = await getPrivateKeys(senderAddresses);
      if (privateKeysMap.size === 0) {
        return { success: false, error: "Для указанных адресов отправителей не найдено приватных ключей." };
      }
      const postTransactionActions = async () => {
        await new Promise((resolve) => setTimeout(resolve, 3500));
        await fetchAndSendWalletsToRenderer(event.sender);
      };
      switch (transactionType) {
        case "singleToSingle": {
          if (senderAddresses.length === 0 || !senderAddresses[0]) {
            return { success: false, error: "Не указан адрес отправителя для транзакции SingleToSingle." };
          }
          if (recipientDetails.length === 0 || !recipientDetails[0]) {
            return { success: false, error: "Не указан адрес или сумма получателя для транзакции SingleToSingle." };
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
          return { success: true, txid };
        }
        case "singleToMultiple": {
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
            recipientDetails,
            // Передаем ВЕСЬ массив получателей
            feeInSompi
          );
          await postTransactionActions();
          return { success: true, txids };
        }
        case "multipleToSingle": {
          if (recipientDetails.length !== 1 || !recipientDetails[0].amount) {
            return { success: false, error: "Для этого типа транзакции требуется один получатель и сумма, отправляемая с КАЖДОГО кошелька." };
          }
          if (senderAddresses.length === 0) {
            return { success: false, error: "Выберите хотя бы один кошелек-отправитель." };
          }
          const results = await sendKaspaMultipleToSingle(
            senderAddresses,
            privateKeysMap,
            recipientDetails[0].address,
            recipientDetails[0].amount,
            // Эта сумма будет отправлена с КАЖДОГО кошелька
            feeInSompi
            // Эта комиссия будет применена к КАЖДОЙ транзакции
          );
          await postTransactionActions();
          const successfulTxs = results.filter((r) => r.status === "success");
          const failedTxs = results.filter((r) => r.status === "failed");
          if (failedTxs.length > 0) {
            return {
              success: false,
              error: `Операция завершена с ошибками. Успешно: ${successfulTxs.length}, с ошибкой: ${failedTxs.length}.`,
              details: results
              // Отправляем все детали на фронтенд для отображения
            };
          }
          return {
            success: true,
            txids: successfulTxs.map((r) => r.txid),
            // Возвращаем массив всех txid
            details: results
          };
        }
        default:
          return { success: false, error: "Неизвестный тип транзакции." };
      }
    } catch (error) {
      console.error(`Ошибка при отправке Kaspa транзакции: ${error.message}`);
      return { success: false, error: error.message || "Произошла неизвестная ошибка при отправке транзакции." };
    }
  }
});
ipcMain.handle("deploy", async (event, { action, payload }) => {
  try {
    let txid;
    let isAvailable;
    switch (action) {
      case "deploy":
        txid = await deployKrc20Token(payload);
        return { success: true, txid };
      case "checkTicker":
        isAvailable = await checkTickerAvailability(payload.ticker);
        return { success: true, available: isAvailable };
      default:
        return { success: false, error: "Unknown Kasplex action" };
    }
  } catch (error) {
    console.error(`Error during Kasplex action '${action}':`, error);
    return { success: false, error: error.message };
  }
});
ipcMain.handle("start-mint", async (event, params) => {
  const { walletAddress } = params;
  try {
    const privateKeys = await getPrivateKeys([walletAddress]);
    const privateKey = privateKeys.get(walletAddress);
    if (!privateKey) {
      throw new Error(`Private key not found for address ${walletAddress}`);
    }
    const onProgressCallback = (update) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send("mint-progress-update", update);
      }
    };
    startMintProcess({
      processId: params.processId,
      privateKey,
      ticker: params.ticker,
      mintTimes: params.mintTimes,
      feeInKas: params.fee
    }, onProgressCallback);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message || "Failed to start mint process." };
  }
});
ipcMain.handle("stop-mint", async (_event, processId) => {
  const success = stopMintProcess(processId);
  if (success) {
    return { success: true };
  }
  return { success: false, error: "Process not found or already stopped." };
});
ipcMain.handle("get-token-info", async (_event, ticker) => {
  if (!ticker || ticker.trim() === "") {
    return { success: false, error: "Invalid ticker provided. Ticker must be a non-empty string." };
  }
  try {
    const response = await KasplexApi.getToken(ticker.toLowerCase());
    if (response && response.message === "successful") {
      if (Array.isArray(response.result) && response.result.length > 0) {
        return { success: true, data: response.result[0] };
      } else {
        return { success: false, error: `Token with ticker "${ticker}" not found.` };
      }
    } else {
      return { success: false, error: response.message || "API returned an unsuccessful response." };
    }
  } catch (e) {
    console.error(`Error in 'get-token-info' handler for ticker "${ticker}":`, e);
    return { success: false, error: e.message || `Failed to fetch info for ${ticker}. Check your network connection.` };
  }
});
ipcMain.handle("get-token-market-info", async (_event, ticker) => {
  if (!ticker || typeof ticker !== "string") {
    return { success: false, error: "Invalid ticker provided." };
  }
  const apiUrl = `https://api.kaspa.com/krc20/${ticker.toUpperCase()}`;
  try {
    console.log(`[Proxy] Fetching: ${apiUrl}`);
    const response = await fetch(apiUrl);
    if (!response.ok) {
      if (response.status === 404) {
        console.warn(`[Proxy] No market data found for ${ticker} (404).`);
        return { success: true, data: null };
      }
      throw new Error(`API responded with status: ${response.status}`);
    }
    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error(`[Proxy] Error fetching data for ${ticker}:`, error);
    return { success: false, error: error.message };
  }
});
async function fetchAndSendWalletsToRenderer(targetWebContents) {
  console.log(`Main: Fetching and sending wallets for network: ${currentNetwork} to renderer.`);
  try {
    const walletsFromDb = await getWalletsListForFrontend();
    console.log(`Main: Fetched ${walletsFromDb.length} wallets from DB for network ${currentNetwork}.`);
    if (walletsFromDb.length === 0) {
      console.log("Main: No wallets in DB for the current network. Sending empty list.");
      return [];
    }
    const addresses = walletsFromDb.map((w) => w.address);
    console.log(`Main: Extracted ${addresses.length} addresses for balance check.`);
    const balances = await getBalancesForAddresses(addresses);
    console.log("Main: Fetched balances from RPC.");
    const walletsWithBalances = walletsFromDb.map((wallet) => {
      const balanceStr = balances[wallet.address];
      return {
        id: String(wallet.id),
        name: wallet.name,
        address: wallet.address,
        balance: balanceStr,
        withdrawal: wallet.withdrawal
      };
    });
    console.log(`Main: Prepared ${walletsWithBalances.length} wallets with balances. Sending to renderer.`);
    targetWebContents.send("wallets-updated", walletsWithBalances);
  } catch (error) {
    console.error(`Main: Error in fetchAndSendWalletsToRenderer: ${error.message || error}`);
  }
}
app.whenReady().then(async () => {
  console.log("App is ready. Determining database path and initializing...");
  try {
    initializeDatabase();
    console.log("Database initialization call finished.");
  } catch (error) {
    console.error("FATAL ERROR: Database failed to initialize.", error);
    app.quit();
    return;
  }
  initialPasswordSetupStatus = isPasswordSetupComplete();
  Kiwi.setNetwork(Wasm.NetworkType.Testnet);
  createWindow();
});
export {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
