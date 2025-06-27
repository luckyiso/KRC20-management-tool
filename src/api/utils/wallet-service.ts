import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
globalThis.WebSocket = require("websocket").w3cwebsocket;

import Database from "better-sqlite3";
import {generateKeys} from "../WalletGenerator/WalletGenerator.ts"

import * as crypto from 'node:crypto';
import * as path from 'node:path';
import { app } from 'electron';
import {Kiwi, Wallet} from "@kasplex/kiwi";

const ALGORITHM = 'aes-256-cbc'; // Алгоритм шифрования
const IV_LENGTH = 16; // Длина Initialization Vector (IV) для CBC
const KEY_LENGTH = 32; // Длина ключа шифрования (256 бит для aes-256)
const SALT_STORAGE_LENGTH = 16; // Длина соли для деривации ключа из пароля
const ITERATIONS = 100000; // Количество итераций KDF (должно быть достаточно большим)
const DIGEST = 'sha512'; // Алгоритм хэширования для PBKDF2

const SETUP_COMPLETE_SETTING_NAME = 'passwordSetupComplete';
const VERIFICATION_BLOCK_VALUE = "Kaspa Wallet Verification String"; // Любая фиксированная строка


let db: Database.Database | null = null;

function getDbPath(): string {
    const appDataPath = app.getPath('userData');
    const dbFileName = 'wallet.db';
    const dbPath = path.join(appDataPath, dbFileName);
    console.log(`Database path: ${dbPath}`);
    return dbPath;
}

export function initializeDatabase(): void {
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
    if (!db) {
        console.error("Database not initialized when getting password parameters.");
        return null;
    }
    try {
        const saltHex = getSetting('kdfSalt');
        const iterationsStr = getSetting('kdfIterations');
        const digest = getSetting('kdfDigest');

        if (saltHex && iterationsStr && digest) {
            return {
                salt: Buffer.from(saltHex, 'hex'),
                iterations: Number(iterationsStr),
                digest: digest
            };
        }
        return null;

    } catch (error) {
        console.error("Error getting password setup parameters from DB:", error);
        return null;
    }
}

function encryptData(data: string, key: Buffer): { encryptedData: string, iv: string } {
    const iv = crypto.randomBytes(IV_LENGTH);
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
    const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

function deriveEncryptionKey(password: string, salt: Buffer, iterations: number, digest: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        crypto.pbkdf2(password, salt, iterations, KEY_LENGTH, digest, (err, derivedKey) => {
            if (err) reject(err);
            else resolve(derivedKey);
        });
    });
}

export async function completePasswordSetup(password: string): Promise<void> {
    if (!db) { throw new Error("Database not initialized."); }
    if (isPasswordSetupComplete()) {
        console.warn("Password setup already complete.");
        return;
    }

    try {
        const salt = crypto.randomBytes(SALT_STORAGE_LENGTH);

        const masterKey = await deriveEncryptionKey(password, salt, ITERATIONS, DIGEST);

        const verificationBlock = VERIFICATION_BLOCK_VALUE;
        const encryptedVerificationBlock = encryptData(verificationBlock, masterKey);

        setSetting('kdfSalt', salt.toString('hex'));
        setSetting('kdfIterations', String(ITERATIONS));
        setSetting('kdfDigest', DIGEST);
        setSetting('verificationBlockEncrypted', encryptedVerificationBlock.encryptedData);
        setSetting('verificationBlockIv', encryptedVerificationBlock.iv);

        setSetting(SETUP_COMPLETE_SETTING_NAME, 'true');

        console.log("Password setup parameters and verification block saved.");

    } catch (error: any) {
        console.error("Error completing password setup:", error);
        throw new Error(`Failed to complete password setup: ${error.message || error}`);
    }
}

export async function verifyPassword(password: string): Promise<boolean> {
    if (!db) { throw new Error("Database not initialized."); }
    if (!isPasswordSetupComplete()) {
        throw new Error("Password setup not complete. Please setup a password.");
    }

    try {
        const params = getPasswordSetupParameters();
        const encryptedBlock = getSetting('verificationBlockEncrypted');
        const iv = getSetting('verificationBlockIv');

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

    } catch (error: any) {
        console.error("Technical error during password verification:", error);
        return false;
    }
}

let masterEncryptionKey: Buffer | null = null;

export async function unlockStorage(password: string): Promise<void> {
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

    } catch (error: any) {
        masterEncryptionKey = null;
        console.error("Failed to unlock storage:", error);
        throw new Error("Failed to unlock storage after verification.");
    }
}

export function lockStorage(): void {
    masterEncryptionKey = null;
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
            const rows = db.prepare('SELECT id, name, address, withdrawal FROM wallets WHERE network = ?').all(Kiwi.network) as any[];

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

        const receivePrivateKeyString = wallet.receivePrivateKey;
        const encryptedReceivePrivateKey = encryptData(receivePrivateKeyString, masterKey);
        console.log("Private keys encrypted.");


        const insertStmt = db.prepare('INSERT INTO wallets (name, address, encryptedReceivePrivateKey, receiveIv, network) VALUES (?, ?, ?, ?, ?)');
        let finalName: string;
        if (name && name.trim() !== '') {
            finalName = name.trim();
            console.log(`Using provided wallet name: "${finalName}"`);
        } else {
            console.log("Generating default wallet name in 'wN' format...");
            let maxNumber = 0;

            try {

                const existingNames = db!.prepare('SELECT name FROM wallets').all() as { name: string }[];

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
            } catch (dbError: any) {
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
            address: wallet.receiveAddress,
        };

    } catch (error: any) {
        console.error("Error during wallet creation and saving:", error);
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
        const wallet = Wallet.fromMnemonic(key);

        console.log("Successfully imported as Mnemonic.");
        const address = wallet.toAddress(dbNetwork).toString();
        const privateKey = wallet.toPrivateKey()
        const encryptedReceivePrivateKey = encryptData(privateKey, masterKey);

        const insertStmt = db.prepare('INSERT INTO wallets (name, address, encryptedReceivePrivateKey, receiveIv, network) VALUES (?, ?, ?, ?, ?)');
        const info = insertStmt.run(name, address, encryptedReceivePrivateKey.encryptedData, encryptedReceivePrivateKey.iv, dbNetwork);
        const newWalletId = info.lastInsertRowid;

        return {
            id: Number(newWalletId),
            name: name,
            address: address,
        };

    } catch (mnemonicError: any) {
        console.warn(`Mnemonic import failed: ${mnemonicError && mnemonicError.message ? mnemonicError.message : mnemonicError}. Attempting to import as Private Key...`);

        try {
            const wallet = Wallet.fromPrivateKey(key);
            const address = wallet.toAddress(dbNetwork).toString();
            console.log(address);

            const encryptedReceivePrivateKey = encryptData(key, masterKey);

            const insertStmt = db.prepare('INSERT INTO wallets (name, address, encryptedReceivePrivateKey, receiveIv, network) VALUES (?, ?, ?, ?, ?)');
            const info = insertStmt.run(name, address, encryptedReceivePrivateKey.encryptedData, encryptedReceivePrivateKey.iv, dbNetwork);
            const newWalletId = info.lastInsertRowid;

            return {
                id: Number(newWalletId),
                name: name,
                address: address,
            };

        } catch (privateKeyError: any) {
            console.error(`Private Key import also failed: ${privateKeyError && privateKeyError.message ? privateKeyError.message : privateKeyError}. Neither format recognized.`);
            throw new Error("Invalid key format. Please enter a valid mnemonic phrase or private key.");
        }
    }
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
        const query = `DELETE FROM wallets WHERE address = ?`;

        const stmt = db.prepare(query);
        const result = stmt.run(address);

        return result.changes > 0;
    } catch (error: any) {
        console.error(`Error deleting wallet with address ${address}`, error);
        throw new Error(`Failed to delete wallet: ${error.message || String(error)}`);
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
        console.log("Successfully imported as Mnemonic.");
        const address = key

        const insertStmt = db.prepare('INSERT INTO wallets (name, address, network, withdrawal) VALUES (?, ?, ?, ?)');
        const info = insertStmt.run(name, address, dbNetwork, 1);
        const newWalletId = info.lastInsertRowid;

        return {
            id: Number(newWalletId),
            name: name,
            address: address,
            withdrawal: 1
        };

    } catch (mnemonicError: any) {
        throw new Error("Invalid addressformat. Please enter a valid address.");
    }
}

export async function renameWallet(address: string, newName: string): Promise<boolean> {
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

    let fractionalString = fractionalPart.toString().padStart(decimals, '0');

    if (fixedDecimals < decimals) {
        fractionalString = fractionalString.substring(0, fixedDecimals);
    }

    const fullNumberString = `${integerPart}.${fractionalString}`;

    const numberForFormatting = parseFloat(fullNumberString);

    if (isNaN(numberForFormatting)) {
        console.warn(`Failed to parse number for formatting: ${fullNumberString}`);
        return String(rawBalance);
    }

    const formatter = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: fixedDecimals,
        maximumFractionDigits: fixedDecimals,
        useGrouping: true
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
        const placeholders = addresses.map(() => '?').join(',');
        const query = `SELECT address, encryptedReceivePrivateKey, receiveIv FROM wallets WHERE address IN (${placeholders})`;

        const stmt = db.prepare(query);
        const rows = stmt.all(...addresses) as Array<{ address: string, encryptedReceivePrivateKey: string, receiveIv: string }>;

        for (const row of rows) {
            try {
                const decryptedPrivateKey = decryptData(row.encryptedReceivePrivateKey, row.receiveIv, masterKey);
                privateKeysMap.set(row.address, decryptedPrivateKey);
            } catch (decryptionError: any) {
                console.error(`Error decrypting private key for address ${row.address}: ${decryptionError.message}`);
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











