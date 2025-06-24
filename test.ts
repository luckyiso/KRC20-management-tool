
import {Enum, KaspaApi, KasplexApi, Kiwi, KRC20, Rpc, Utils, Wasm} from "@kasplex/kiwi"
Kiwi.setNetwork(Wasm.NetworkType.Mainnet);
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
await Rpc.setInstance(Wasm.NetworkType.Mainnet).connect()
// const privateKeyStr = "ebe0ed96078e0e5b734b10c0255c732d2138e946f09e399967c0839608de73ff"
// const _privateKey = new Wasm.PrivateKey(privateKeyStr)
// const krc20data = Utils.createKrc20Data({
//     p: "krc-20",
//     op: Enum.OP.Mint,
//     tick: 'ABOBA',
// })
// const mintTimes = 1
// for (let i = 0; i < 100; i++) {
//     const committxid = await KRC20.executeCommit(_privateKey, krc20data, 10000n)
//     console.log("commit txid: ", committxid!)
//
//     await delay(3000)
// }
if (Kiwi.network == 1){
    console.log(`getMarketInfo response: \x1B[32m%s\x1B[0m `, JSON.stringify(res))
}
const res = await KaspaApi.postTransactions(params);
await Rpc.getInstance().disconnect()
