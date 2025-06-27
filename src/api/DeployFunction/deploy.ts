import { KasplexApi, Kiwi, KRC20, Rpc, Utils, Wasm, Enum } from "@kasplex/kiwi";
import {getBalancesForAddresses} from "../BalanceChecker/KaspaBalance.ts";
import {getPrivateKeys} from "../utils/wallet-service.ts";

interface DeployArgs {
  walletAddress: string;
  ticker: string;
  maxSupply: string;
  mintLimit: string;
  preAllocationAmount?: string;
  decimals?: string;
}

export async function checkTickerAvailability(ticker: string): Promise<boolean> {
  if (!ticker || !/^[A-Z]{4,6}$/.test(ticker)) {
    throw new Error("Invalid ticker format. Must be 4-6 uppercase letters.");
  }

  await Rpc.setInstance(Kiwi.network).connect();
  try {
    const tokenInfo = await KasplexApi.getToken(ticker);
    return tokenInfo?.result?.[0]?.state === 'unused';
  } finally {
    await Rpc.getInstance().disconnect();
  }
}

export async function deployKrc20Token(args: DeployArgs): Promise<string> {
  const { walletAddress, ticker, maxSupply, mintLimit, preAllocationAmount, decimals } = args;

  if (!/^[A-Z]{4,6}$/.test(ticker)) {
    throw new Error("Ticker must be 4-6 uppercase English letters.");
  }

  await Rpc.setInstance(Kiwi.network).connect();

  const tokenInfo = await KasplexApi.getToken(ticker);
  if (tokenInfo && tokenInfo.result && tokenInfo.result[0].state !== 'unused') {
    throw new Error(`Token with ticker "${ticker}" already exists or is reserved.`);
  }

  const balances = await getBalancesForAddresses([walletAddress]);
  const walletBalanceStr = balances[walletAddress];

  if (!walletBalanceStr) {
    throw new Error(`Could not retrieve balance for wallet ${walletAddress}.`);
  }

  const maxInBaseUnitsBigInt = Wasm.kaspaToSompi(maxSupply);
  if (maxInBaseUnitsBigInt === undefined) {
    throw new Error(`Invalid Max Supply value: "${maxSupply}". Please enter a valid number.`);
  }
  const maxInBaseUnits = maxInBaseUnitsBigInt.toString();

  const limInBaseUnitsBigInt = Wasm.kaspaToSompi(mintLimit);
  if (limInBaseUnitsBigInt === undefined) {
    throw new Error(`Invalid Amount per mint value: "${mintLimit}". Please enter a valid number.`);
  }
  const limInBaseUnits = limInBaseUnitsBigInt.toString();

  let preInBaseUnits = "";

  if (preAllocationAmount && preAllocationAmount.trim() !== '') {
    const preAmountBigInt = Wasm.kaspaToSompi(preAllocationAmount);
    if (preAmountBigInt === undefined) {
      throw new Error(`Invalid Pre-allocation amount: "${preAllocationAmount}". Please enter a valid number.`);
    }

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
    max: maxInBaseUnits,
    lim: limInBaseUnits,
    pre: preInBaseUnits,
    dec: decimals || "8",
    amt: "",
  });

  console.log("Deploying KRC-20 token with data:", deployData);

  const txid = await KRC20.deploy(privateKey, deployData);

  if (!txid) {
    throw new Error("Deployment failed. The transaction was not broadcasted successfully.");
  }

  console.log(`Token ${ticker} deployed successfully. TXID: ${txid}`);
  await Rpc.getInstance().disconnect();
  return txid;
}