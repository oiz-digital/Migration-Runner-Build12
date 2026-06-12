import { ethers } from "ethers";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { encryptSecret, decryptSecret } from "./crypto-vault";

const MNEMONIC_KEY = "wallet_mnemonic_enc";
let cachedMnemonic: string | null = null;

async function loadOrCreateMnemonic(): Promise<string> {
  if (cachedMnemonic) return cachedMnemonic;

  // Try env first
  const envM = process.env["WALLET_MNEMONIC"];
  if (envM && envM.trim()) {
    cachedMnemonic = envM.trim();
    return cachedMnemonic;
  }

  // Try DB settings
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, MNEMONIC_KEY)).limit(1);
  if (row?.value) {
    const dec = decryptSecret(row.value);
    if (dec) {
      cachedMnemonic = dec;
      return dec;
    }
  }

  // Generate new
  const wallet = ethers.Wallet.createRandom();
  const mnemonic = wallet.mnemonic!.phrase;
  const enc = encryptSecret(mnemonic);
  await db.insert(settingsTable).values({ key: MNEMONIC_KEY, value: enc })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value: enc, updatedAt: new Date() } });
  cachedMnemonic = mnemonic;
  return mnemonic;
}

export async function deriveEvmWallet(userId: number): Promise<{ address: string; privateKey: string; path: string; index: number }> {
  const mnemonic = await loadOrCreateMnemonic();
  const path = `m/44'/60'/0'/0/${userId}`;
  const hd = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, path);
  return { address: ethers.getAddress(hd.address), privateKey: hd.privateKey, path, index: userId };
}

export async function getMnemonicForReveal(): Promise<string> {
  return loadOrCreateMnemonic();
}

export async function isMnemonicConfigured(): Promise<boolean> {
  if (process.env["WALLET_MNEMONIC"]) return true;
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, MNEMONIC_KEY)).limit(1);
  return !!row?.value;
}
