// Импортируем необходимые части из wasm

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
globalThis.WebSocket = require("websocket").w3cwebsocket;

import Database from "better-sqlite3";
import {generateKeys} from "../WalletGenerator/WalletGenerator.ts"

import * as crypto from 'node:crypto';
import * as path from 'node:path';
import { app } from 'electron';
import {Kiwi, Wallet, Mnemonic} from "@kasplex/kiwi";

const ALGORITHM = 'aes-256-cbc'; // Алгоритм шифрования
const IV_LENGTH = 16; // Длина Initialization Vector (IV) для CBC
const KEY_LENGTH = 32; // Длина ключа шифрования (256 бит для aes-256)
const SALT_STORAGE_LENGTH = 16; // Длина соли для деривации ключа из пароля
const ITERATIONS = 100000; // Количество итераций KDF (должно быть достаточно большим)
const DIGEST = 'sha512'; // Алгоритм хэширования для PBKDF2

const SETUP_COMPLETE_SETTING_NAME = 'passwordSetupComplete';
const VERIFICATION_BLOCK_VALUE = "Kaspa Wallet Verification String"; // Любая фиксированная строка


let db: Database.Database | null = null; // Экземпляр базы данных

function getDbPath(): string {
    const appDataPath = app.getPath('userData');
    const dbFileName = 'wallet.db'; // Имя файла базы данных
    const dbPath = path.join(appDataPath, dbFileName);
    console.log(`Database path: ${dbPath}`);
    return dbPath;
}

export function initializeDatabase(): void { // Экспортируем функцию инициализации
    if (db) {
        console.log('Database already initialized.');
        return;
    }
    try {
        const dbPath = getDbPath();
        db = new Database(dbPath);
        console.log('Database opened.');

        db.exec(`
            CREATE TABLE IF NOT EXISTS settings (
                name TEXT PRIMARY KEY,
                value TEXT
            );
        `);
        console.log('Settings table checked/created.');

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
        console.log('Wallets table checked/created.');
        console.log('Database initialization complete.');
    } catch (error) {
        console.error("Error initializing or opening database:", error);
    }
}

function getSetting(name: string): string | null {
    if (!db) { throw new Error("Database not initialized."); }
    const stmt = db.prepare('SELECT value FROM settings WHERE name = ?');
    const row = stmt.get(name) as { value: string } | undefined;
    return row ? row.value : null;
}

function setSetting(name: string, value: string): void {
    if (!db) { throw new Error("Database not initialized."); }
    const stmt = db.prepare('INSERT OR REPLACE INTO settings (name, value) VALUES (?, ?)');
    stmt.run(name, value);
}

export function isPasswordSetupComplete(): boolean {
    if (!db) {
        console.warn("Database not initialized when checking setup status.");
        return false;
    }
    try {
        const saltExists = getSetting('kdfSalt') !== null;
        const iterationsExist = getSetting('kdfIterations') !== null;
        const digestExists = getSetting('kdfDigest') !== null;
        const setupCompleteFlag = getSetting(SETUP_COMPLETE_SETTING_NAME) === 'true';
        const verificationBlockExists = getSetting('verificationBlockEncrypted') !== null;

        return saltExists && iterationsExist && digestExists && setupCompleteFlag && verificationBlockExists;

    } catch (error) {
        console.error("Error checking password setup status:", error);
        return false;
    }
}

function getPasswordSetupParameters(): { salt: Buffer, iterations: number, digest: string } | null {
    // Убедитесь, что db инициализирована перед вызовом этой функции
    if (!db) {
        console.error("Database not initialized when getting password parameters.");
        return null;
    }
    try {
        // Читаем сохраненные параметры из таблицы settings
        const saltHex = getSetting('kdfSalt');
        const iterationsStr = getSetting('kdfIterations');
        const digest = getSetting('kdfDigest');

        // Проверяем, найдены ли все необходимые параметры
        if (saltHex && iterationsStr && digest) {
            // Преобразуем их в нужный тип и возвращаем объект
            return {
                salt: Buffer.from(saltHex, 'hex'), // Соль хранится как hex строка
                iterations: Number(iterationsStr), // Итерации хранятся как строка числа
                digest: digest // Дайджест хранится как строка
            };
        }
        // Если хотя бы один параметр не найден, возвращаем null
        return null;

    } catch (error) {
        console.error("Error getting password setup parameters from DB:", error);
        return null;
    }
}

function encryptData(data: string, key: Buffer): { encryptedData: string, iv: string } {
    const iv = crypto.randomBytes(IV_LENGTH); // Генерируем уникальный IV
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return {
        encryptedData: encrypted,
        iv: iv.toString('hex'),
    };
}

function decryptData(encryptedData: string, iv: string, key: Buffer): string {
    const ivBuffer = Buffer.from(iv, 'hex');
    // Внимание: Дешифрование может выбросить ошибку, если ключ или IV неверны, или данные повреждены
    const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

function deriveEncryptionKey(password: string, salt: Buffer, iterations: number, digest: string): Promise<Buffer> {
    // Используем стандартную Node.js функцию pbkdf2
    return new Promise((resolve, reject) => {
        crypto.pbkdf2(password, salt, iterations, KEY_LENGTH, digest, (err, derivedKey) => {
            if (err) reject(err); // Если ошибка, отклоняем Promise
            else resolve(derivedKey); // Если успешно, разрешаем Promise с деривированным ключом
        });
    });
}

export async function completePasswordSetup(password: string): Promise<void> {
    if (!db) { throw new Error("Database not initialized."); }
    if (isPasswordSetupComplete()) {
        console.warn("Password setup already complete.");
        return; // Не выполняем повторно
    }

    try {
        // ### Генерируем новую уникальную соль для хранилища ###
        const salt = crypto.randomBytes(SALT_STORAGE_LENGTH);

        // ### Деривируем мастер-ключ из введенного пароля и сгенерированной соли ###
        const masterKey = await deriveEncryptionKey(password, salt, ITERATIONS, DIGEST);

        // ### Шифруем проверочный блок ФИКСИРОВАННЫМ значением ###
        const verificationBlock = VERIFICATION_BLOCK_VALUE;
        const encryptedVerificationBlock = encryptData(verificationBlock, masterKey);

        // ### Сохраняем все параметры и зашифрованный блок в таблицу settings ###
        setSetting('kdfSalt', salt.toString('hex'));
        setSetting('kdfIterations', String(ITERATIONS));
        setSetting('kdfDigest', DIGEST);
        setSetting('verificationBlockEncrypted', encryptedVerificationBlock.encryptedData);
        setSetting('verificationBlockIv', encryptedVerificationBlock.iv);

        // Устанавливаем флаг, что установка пароля завершена
        setSetting(SETUP_COMPLETE_SETTING_NAME, 'true');

        console.log("Password setup parameters and verification block saved.");

        // ### TODO: Опционально, разблокировать хранилище сразу после установки ###
        // Это позволит перейти на дашборд без повторного ввода пароля
        // unlockStorage(password); // Нужна реализация unlockStorage, которая хранит ключ в памяти
        // В этой версии примера, просто сохраняем и помечаем как завершенное.

    } catch (error: any) {
        console.error("Error completing password setup:", error);
        // Если что-то пошло не так при сохранении, возможно, нужно сбросить флаг завершения
        // setSetting(SETUP_COMPLETE_SETTING_NAME, 'false'); // Сбросить флаг при ошибке
        throw new Error(`Failed to complete password setup: ${error.message || error}`);
    }
}

export async function verifyPassword(password: string): Promise<boolean> {
    if (!db) { throw new Error("Database not initialized."); }
    if (!isPasswordSetupComplete()) {
        throw new Error("Password setup not complete. Please setup a password.");
    }

    try {
        // Получаем сохраненные параметры KDF и зашифрованный блок
        const params = getPasswordSetupParameters();
        const encryptedBlock = getSetting('verificationBlockEncrypted');
        const iv = getSetting('verificationBlockIv');

        if (!params || !encryptedBlock || !iv) {
            throw new Error("Verification data not found. Password setup incomplete?");
        }

        // Деривируем ключ из введенного пароля и сохраненных параметров
        const potentialKey = await deriveEncryptionKey(password, params.salt, params.iterations, params.digest);

        // ### Попытка дешифровать проверочный блок деривированным ключом ###
        const decryptedBlock = decryptData(encryptedBlock, iv, potentialKey);

        // ### Проверяем, совпадает ли дешифрованный блок с ожидаемым значением ###
        if (decryptedBlock === VERIFICATION_BLOCK_VALUE) {
            console.log("Password verification successful.");
            return true; // Пароль верен
        } else {
            console.warn("Password verification failed. Decrypted block mismatch.");
            return false; // Пароль не верен (дешифрованный блок не совпал)
        }

    } catch (error: any) {
        // ### ### ### МОДИФИЦИРОВАННЫЙ БЛОК catch ### ### ###
        // Если ЛЮБАЯ ошибка произошла в блоке try (чаще всего при decryptData из-за неверного ключа)
        // И при этом установка была завершена и данные для проверки найдены...
        // ...мы считаем это признаком НЕВЕРНОГО ПАРОЛЯ.
        console.error("Technical error during password verification:", error); // Логируем техническую ошибку для отладки на бэке

        // ### ### ### ВЕРНУТЬ false ВМЕСТО ВЫБРАСЫВАНИЯ ОШИБКИ ### ### ###
        // Возвращаем false, что означает "пароль неверный" или "верификация не пройдена".
        return false;
        // ### ### ### КОНЕЦ МОДИФИЦИРОВАННОГО БЛОКА catch ### ### ###
    }
}

let masterEncryptionKey: Buffer | null = null;

export async function unlockStorage(password: string): Promise<void> {
    const params = getPasswordSetupParameters();
    if (!params) {
        throw new Error("Password setup parameters not found.");
    }
    // ### Проверка пароля перед разблокировкой ###
    const isVerified = await verifyPassword(password);
    if (!isVerified) {
        throw new Error("Incorrect password.");
    }

    try {
        // ### Деривируем мастер-ключ из введенного пароля и сохраненных параметров ###
        const key = await deriveEncryptionKey(password, params.salt, params.iterations, params.digest);
        masterEncryptionKey = key; // Сохраняем мастер-ключ в памяти
        console.log("Storage unlocked. Master encryption key loaded.");

    } catch (error: any) {
        masterEncryptionKey = null; // Сбрасываем ключ при ошибке
        console.error("Failed to unlock storage:", error);
        throw new Error("Failed to unlock storage after verification.");
    }
}

export function lockStorage(): void {
    masterEncryptionKey = null; // Удаляем мастер-ключ из памяти
    console.log("Storage locked. Master encryption key removed from memory.");
}

export function getMasterEncryptionKey(): Buffer | null {
    return masterEncryptionKey;
}

export async function getWalletsListForFrontend(): Promise<Array<{ id: number; name: string; address: string, withdrawal: number }>> {
    if (!db) {
        console.warn("Database not initialized when fetching wallet list.");
        return [];
    }
        try {
            // Выбираем только id, name, address из таблицы wallets
            const rows = db.prepare('SELECT id, name, address, withdrawal FROM wallets WHERE network = ?').all(Kiwi.network) as any[];

            // Преобразуем строки БД в нужный формат
            const wallets = rows.map((row) => ({
                id: row.id,
                name: row.name,
                address: row.address,
                withdrawal: row.withdrawal
            }));

            console.log(`Workspaceed ${wallets.length} wallets from DB for frontend list.`);
            return wallets;

        } catch (error: any) {
            console.error("Error fetching wallet list from database:", error);
            throw new Error(`Failed to load wallet list: ${error.message || error}`);
        }
}

export async function createAndSaveWallet(network: number, name?: string): Promise<{ id: number; name: string; address: string }> {
    // ### 1. Проверяем, разблокировано ли хранилище (доступен ли мастер-ключ) ###
    const masterKey = getMasterEncryptionKey(); // Получаем мастер-ключ из памяти
    if (!masterKey) {
        console.warn("Attempted to create wallet while storage is locked.");
        throw new Error("Storage is locked. Please log in to create a wallet."); // Выбрасываем ошибку, если хранилище заблокировано
    }
    if (!db) {
        throw new Error("Database not initialized. Cannot save wallet."); // Проверка инициализации БД
    }

    try {
        console.log(`Starting wallet creation process for network: ${network}`);

        // ### 2. Используем WalletGenerator для генерации ключей и адресов ###
        // Создаем новый экземпляр генератора (или используем существующий, если создали глобально)
        const wallet = await generateKeys(); // Включаем отладку в генераторе при создании
        const dbNetwork = Kiwi.network;

        const address = wallet.receiveAddress;
        const receivePrivateKeyString = wallet.receivePrivateKey;
        const encryptedReceivePrivateKey = encryptData(receivePrivateKeyString, masterKey);
        console.log("Private keys encrypted.");


        const insertStmt = db.prepare('INSERT INTO wallets (name, address, encryptedReceivePrivateKey, receiveIv, network) VALUES (?, ?, ?, ?, ?)');
        // TODO: Добавить сохранение change address и encryptedChangePrivateKey/changeIv, если они используются
        // TODO: Добавить сохранение network, если нужно различать кошельки разных сетей в одной таблице

        // Определяем имя кошелька (используем переданное имя или генерируем дефолтное)
        let finalName: string;
        if (name && name.trim() !== '') {
            // Если имя предоставлено, используем его (обрезаем пробелы по краям)
            finalName = name.trim();
            console.log(`Using provided wallet name: "${finalName}"`);
        } else {
            // ### Генерируем имя по умолчанию в формате "wN" ###
            console.log("Generating default wallet name in 'wN' format...");
            let maxNumber = 0; // Начинаем с 0

            try {
                // Получаем имена всех существующих кошельков из базы данных
                // Предполагаем, что db уже инициализирована
                const existingNames = db!.prepare('SELECT name FROM wallets').all() as { name: string }[]; // Используем non-null assertion `db!`

                // Регулярное выражение для поиска имен в формате "w" + число
                const nameRegex = /^w(\d+)$/;

                // Проходимся по всем существующим именам
                for (const row of existingNames) {
                    const match = row.name.match(nameRegex);
                    // Если имя соответствует формату "wN" и удалось извлечь число
                    if (match && match[1]) {
                        const number = parseInt(match[1], 10);
                        // Если число корректно (не NaN)
                        if (!isNaN(number)) {
                            // Обновляем максимальное найденное число
                            maxNumber = Math.max(maxNumber, number);
                        }
                    }
                }
                console.log(`Highest existing 'wN' number found: ${maxNumber}`);
            } catch (dbError: any) {
                console.error("Error querying existing wallet names for default naming:", dbError);
                // Если запрос к БД не удался, логируем ошибку и используем дефолтное maxNumber = 0,
                // чтобы новое имя было как минимум w1.
                maxNumber = 0;
            }
            const nextNumber = maxNumber + 1;
            // Форматируем имя
            finalName = `w${nextNumber}`;
            console.log(`Generated default wallet name: "${finalName}"`);
        }

            // ### Выполняем запись в БД ###
        const info = insertStmt.run(finalName, wallet.receiveAddress, encryptedReceivePrivateKey.encryptedData, encryptedReceivePrivateKey.iv, dbNetwork);

        const newWalletId = info.lastInsertRowid; // Получаем ID только что вставленной записи

        console.log(`Wallet saved to database with ID: ${newWalletId}`);

        // ### TODO: Возможно, сохранить мнемоническую фразу где-то отдельно или предложить пользователю записать ###
        // Обычно мнемоника не хранится в БД в зашифрованном виде рядом с приватными ключами,
        // т.к. ее потеря равносильна потере кошелька. Она используется для восстановления.
        // walletKeys.mnemonic содержит сгенерированную фразу.

        // ### 5. Возвращаем данные созданного кошелька (без приватного ключа) ###
        // Возвращаем данные в формате, достаточном для отображения на фронтенде и идентификации.
        return {
            id: Number(newWalletId),
            name: finalName,
            address: wallet.receiveAddress,
        };

    } catch (error: any) {
        console.error("Error during wallet creation and saving:", error);
        // Пробрасываем ошибку дальше, чтобы обработчик IPC мог ее поймать и отправить на фронтенд
        throw new Error(`Failed to create and save wallet: ${error.message || error}`);
    }
}

export async function importAndSaveWallet(key: string, name: string ): Promise<{ id: number; name: string; address: string;}> {
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
        // Убрано .newWallet() - для импорта не нужно генерировать новый кошелек
        const wallet = Wallet.fromMnemonic(key);

        console.log("Successfully imported as Mnemonic.");
        const address = wallet.toAddress(dbNetwork)
        const privateKey = wallet.toPrivateKey()
        const encryptedReceivePrivateKey = encryptData(privateKey, masterKey);

        const insertStmt = db.prepare('INSERT INTO wallets (name, address, encryptedReceivePrivateKey, receiveIv, network) VALUES (?, ?, ?, ?, ?)');
        const info = insertStmt.run(name, address, encryptedReceivePrivateKey.encryptedData, encryptedReceivePrivateKey.iv, dbNetwork);
        const newWalletId = info.lastInsertRowid;

        return { // <-- ГАРАНТИРОВАННЫЙ ВОЗВРАТ ПРИ УСПЕХЕ МНЕМОНИКИ
            id: Number(newWalletId),
            name: name,
            address: address,
        };

    } catch (mnemonicError: any) {
        // --- 2. Если импорт как мнемоника ЗАВЕРШИЛСЯ ОШИБКОЙ, пробуем как ПРИВАТНЫЙ КЛЮЧ ---
        console.warn(`Mnemonic import failed: ${mnemonicError && mnemonicError.message ? mnemonicError.message : mnemonicError}. Attempting to import as Private Key...`);

        try {
            // Убрано .newWallet() - для импорта не нужно генерировать новый кошелек
            const wallet = Wallet.fromPrivateKey(key);



            const address = wallet.toAddress(dbNetwork).toString();
            console.log(address);

            const encryptedReceivePrivateKey = encryptData(key, masterKey); // Шифруем сам введенный приватный ключ

            const insertStmt = db.prepare('INSERT INTO wallets (name, address, encryptedReceivePrivateKey, receiveIv, network) VALUES (?, ?, ?, ?, ?)');
            const info = insertStmt.run(name, address, encryptedReceivePrivateKey.encryptedData, encryptedReceivePrivateKey.iv, dbNetwork);
            const newWalletId = info.lastInsertRowid;

            return { // <-- ГАРАНТИРОВАННЫЙ ВОЗВРАТ ПРИ УСПЕХЕ ПРИВАТНОГО КЛЮЧА
                id: Number(newWalletId),
                name: name,
                address: address,
            };

        } catch (privateKeyError: any) { // <-- ИСПРАВЛЕНО: переменная privateKeyError
            // --- 3. Если импорт как приватный ключ также ЗАВЕРШИЛСЯ ОШИБКОЙ ---
            console.error(`Private Key import also failed: ${privateKeyError && privateKeyError.message ? privateKeyError.message : privateKeyError}. Neither format recognized.`);
            // ### ГАРАНТИРОВАННЫЙ THROW ПРИ ОБЩЕЙ ОШИБКЕ ###
            throw new Error("Invalid key format. Please enter a valid mnemonic phrase or private key.");
        }
    }// Здесь нет unreachable кода, так как все пути выше либо возвращают, либо выбрасывают ошибку.
}

export async function deleteWallet(address: string): Promise<boolean> {
    const masterKey = getMasterEncryptionKey();
    if (!masterKey) {
        console.warn("Attempted to import wallet while storage is locked.");
        throw new Error("Storage is locked. Please log in to import a wallet.");
    }
    if (!db) {
        throw new Error("Database not initialized. Cannot save wallet.");
    }
    try {
        // Создаем плейсхолдеры для IN-выражения (например, '?,?,?')
        const query = `DELETE FROM wallets WHERE address = ?`;

        // Используйте транзакцию для безопасного удаления нескольких записей
        const stmt = db.prepare(query);
        const result = stmt.run(address);

        return result.changes; // Возвращаем количество удаленных строк
    } catch (error) {
        console.error(`Error deleting wallets with IDs address`, error);
        throw new Error(`Failed to delete wallets: ${error.message || String(error)}`);
    }
}

export async function addAndSaveWallet(key: string, name: string ): Promise<{id: number; name: string; address: string, withdrawal: number}> {
    if (!db) {
        throw new Error("Database not initialized. Cannot save wallet.");
    }
    const dbNetwork = Kiwi.network;
    console.log(`DEBUG_INPUT: Raw key from IPC: "${key}" (length: ${key.length})`);

    try {
        console.log("Attempting to import as Mnemonic...");
        // Убрано .newWallet() - для импорта не нужно генерировать новый кошелек
        console.log("Successfully imported as Mnemonic.");
        const address = key

        const insertStmt = db.prepare('INSERT INTO wallets (name, address, network, withdrawal) VALUES (?, ?, ?, ?)');
        const info = insertStmt.run(name, address, dbNetwork, 1);
        const newWalletId = info.lastInsertRowid;

        return { // <-- ГАРАНТИРОВАННЫЙ ВОЗВРАТ ПРИ УСПЕХЕ МНЕМОНИКИ
            id: Number(newWalletId),
            name: name,
            address: address,
            withdrawal: 1
        };

    } catch (mnemonicError: any) {
        // --- 2. Если импорт как мнемоника ЗАВЕРШИЛСЯ ОШИБКОЙ, пробуем как ПРИВАТНЫЙ КЛЮЧ ---
        throw new Error("Invalid addressformat. Please enter a valid address.");
    }
}

export async function renameWallet(address: string, newName: string): Promise<boolean> {
    const masterKey = getMasterEncryptionKey(); // Проверка, что хранилище разблокировано, если нужно для обновления
    if (!masterKey) {
        console.warn("Attempted to rename wallet while storage is locked.");
        throw new Error("Storage is locked. Please log in to rename a wallet.");
    }
    if (!db) {
        throw new Error("Database not initialized. Cannot rename wallet.");
    }

    try {
        console.log(`Attempting to rename wallet ${address} to ${newName}`);
        const stmt = db.prepare('UPDATE wallets SET name = ? WHERE address = ?');
        const result = stmt.run(newName, address);

        if (result.changes > 0) {
            console.log(`Wallet ${address} successfully renamed to ${newName}.`);
            return true;
        } else {
            console.warn(`Wallet ${address} not found or name is already ${newName}.`);
            return false;
        }
    } catch (error: any) {
        console.error(`Error renaming wallet ${address}:`, error);
        throw new Error(`Failed to rename wallet: ${error.message || String(error)}`);
    }
}

export function formatTokenBalance(rawBalance: string | number, decimals: number, fixedDecimals: number = 2): string {
    const num = typeof rawBalance === 'string' ? BigInt(rawBalance) : BigInt(rawBalance);
    const divisor = BigInt(10) ** BigInt(decimals);

    const integerPart = num / divisor;
    const fractionalPart = num % divisor;

    // Преобразуем дробную часть в строку, дополняя нулями до нужной длины
    let fractionalString = fractionalPart.toString().padStart(decimals, '0');

    // Обрезаем до нужного количества знаков после запятой для вывода
    if (fixedDecimals < decimals) {
        fractionalString = fractionalString.substring(0, fixedDecimals);
    }

    // Собираем числовую строку (без разделителей тысяч, пока)
    const fullNumberString = `${integerPart}.${fractionalString}`;

    // Используем parseFloat для преобразования в число, чтобы затем использовать Intl.NumberFormat
    // Это может быть небезопасно для ОЧЕНЬ больших чисел, которые теряют точность в JS Number.
    // Если балансы могут быть ОЧЕНЬ большими (больше Number.MAX_SAFE_INTEGER), то потребуется библиотека для больших чисел (например, bignumber.js).
    // Но для большинства криптобалансов Number достаточно, особенно если мы форматируем только для отображения.
    const numberForFormatting = parseFloat(fullNumberString);

    if (isNaN(numberForFormatting)) {
        console.warn(`Failed to parse number for formatting: ${fullNumberString}`);
        return String(rawBalance); // Возвращаем сырой баланс или ошибку
    }

    const formatter = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: fixedDecimals,
        maximumFractionDigits: fixedDecimals,
        useGrouping: true // Включаем разделители тысяч
    });

    return formatter.format(numberForFormatting);
}

export async function getPrivateKeys(addresses: string[]): Promise<Map<string, string>> {
    const masterKey = getMasterEncryptionKey();
    if (!masterKey) {
        console.warn("Attempted to retrieve private keys while storage is locked.");
        throw new Error("Storage is locked. Please log in to access wallet data.");
    }
    if (!db) {
        throw new Error("Database not initialized.");
    }

    const privateKeysMap = new Map<string, string>();
    if (addresses.length === 0) {
        return privateKeysMap;
    }

    try {
        // Создаем плейсхолдеры для IN-выражения (например, '?,?,?')
        const placeholders = addresses.map(() => '?').join(',');
        const query = `SELECT address, encryptedReceivePrivateKey, receiveIv FROM wallets WHERE address IN (${placeholders})`;

        // Выполняем запрос
        const stmt = db.prepare(query);
        const rows = stmt.all(...addresses) as Array<{ address: string, encryptedReceivePrivateKey: string, receiveIv: string }>;

        // Дешифруем каждый приватный ключ и добавляем его в Map
        for (const row of rows) {
            try {
                const decryptedPrivateKey = decryptData(row.encryptedReceivePrivateKey, row.receiveIv, masterKey);
                privateKeysMap.set(row.address, decryptedPrivateKey);
            } catch (decryptionError: any) {
                console.error(`Error decrypting private key for address ${row.address}: ${decryptionError.message}`);
                // Можно решить, что делать в этом случае: пропустить этот кошелек или выбросить ошибку
                // Здесь я выбрал пропустить и залогировать.
            }
        }

        if (privateKeysMap.size !== addresses.length) {
            const missingAddresses = addresses.filter(addr => !privateKeysMap.has(addr));
            console.warn(`Could not find private keys for the following addresses: ${missingAddresses.join(', ')}`);
        }

        console.log(`Successfully retrieved and decrypted ${privateKeysMap.size} private keys.`);
        return privateKeysMap;

    } catch (error: any) {
        console.error(`Error fetching private keys for addresses:`, error);
        throw new Error(`Failed to retrieve private keys for selected wallets: ${error.message || error}`);
    }
}











