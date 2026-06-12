import { db, coinsTable, pairsTable, networksTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

// ─── 100 Coins ────────────────────────────────────────────────────────────────

const COINS = [
  // Fiat
  { symbol: "INR",   name: "Indian Rupee",          type: "fiat"   as const, decimals: 2,  rank: null, price: "83.50",       change: "0.00",   binance: null,           logo: "https://cryptologos.cc/logos/thumbs/indian-rupee.png",                           desc: "Indian Rupee – fiat currency used as base for INR pairs." },
  // Stablecoins
  { symbol: "USDT",  name: "Tether",                type: "stable" as const, decimals: 6,  rank: 1,   price: "1.00",        change: "0.01",   binance: "USDTUSDT",     logo: "https://cryptologos.cc/logos/tether-usdt-logo.png",                              desc: "USD-pegged stablecoin by Tether." },
  { symbol: "USDC",  name: "USD Coin",              type: "stable" as const, decimals: 6,  rank: 2,   price: "1.00",        change: "0.00",   binance: "USDCUSDT",     logo: "https://cryptologos.cc/logos/usd-coin-usdc-logo.png",                            desc: "Regulated USD stablecoin by Circle." },
  // Crypto
  { symbol: "BTC",   name: "Bitcoin",               type: "crypto" as const, decimals: 8,  rank: 1,   price: "62450.00",    change: "1.25",   binance: "BTCUSDT",      logo: "https://cryptologos.cc/logos/bitcoin-btc-logo.png",                              desc: "The original decentralized cryptocurrency." },
  { symbol: "ETH",   name: "Ethereum",              type: "crypto" as const, decimals: 8,  rank: 2,   price: "3040.00",     change: "0.85",   binance: "ETHUSDT",      logo: "https://cryptologos.cc/logos/ethereum-eth-logo.png",                             desc: "Smart contract platform powering DeFi and NFTs." },
  { symbol: "BNB",   name: "BNB",                   type: "crypto" as const, decimals: 8,  rank: 4,   price: "595.00",      change: "0.60",   binance: "BNBUSDT",      logo: "https://cryptologos.cc/logos/binance-coin-bnb-logo.png",                         desc: "Binance ecosystem utility token." },
  { symbol: "SOL",   name: "Solana",                type: "crypto" as const, decimals: 8,  rank: 5,   price: "148.00",      change: "2.10",   binance: "SOLUSDT",      logo: "https://cryptologos.cc/logos/solana-sol-logo.png",                               desc: "High-speed Layer-1 blockchain." },
  { symbol: "XRP",   name: "XRP",                   type: "crypto" as const, decimals: 6,  rank: 6,   price: "0.52",        change: "-0.30",  binance: "XRPUSDT",      logo: "https://cryptologos.cc/logos/xrp-xrp-logo.png",                                 desc: "Cross-border payment protocol by Ripple." },
  { symbol: "ADA",   name: "Cardano",               type: "crypto" as const, decimals: 6,  rank: 9,   price: "0.44",        change: "0.50",   binance: "ADAUSDT",      logo: "https://cryptologos.cc/logos/cardano-ada-logo.png",                              desc: "Research-driven proof-of-stake blockchain." },
  { symbol: "AVAX",  name: "Avalanche",             type: "crypto" as const, decimals: 8,  rank: 10,  price: "34.20",       change: "1.80",   binance: "AVAXUSDT",     logo: "https://cryptologos.cc/logos/avalanche-avax-logo.png",                           desc: "Fast finality Layer-1 blockchain." },
  { symbol: "DOGE",  name: "Dogecoin",              type: "crypto" as const, decimals: 8,  rank: 8,   price: "0.145",       change: "3.20",   binance: "DOGEUSDT",     logo: "https://cryptologos.cc/logos/dogecoin-doge-logo.png",                            desc: "The original meme coin." },
  { symbol: "TRX",   name: "TRON",                  type: "crypto" as const, decimals: 6,  rank: 11,  price: "0.113",       change: "0.45",   binance: "TRXUSDT",      logo: "https://cryptologos.cc/logos/tron-trx-logo.png",                                 desc: "Decentralised content entertainment platform." },
  { symbol: "DOT",   name: "Polkadot",              type: "crypto" as const, decimals: 8,  rank: 14,  price: "7.20",        change: "-0.80",  binance: "DOTUSDT",      logo: "https://cryptologos.cc/logos/polkadot-new-dot-logo.png",                         desc: "Multi-chain relay network." },
  { symbol: "MATIC", name: "Polygon",               type: "crypto" as const, decimals: 8,  rank: 13,  price: "0.72",        change: "1.10",   binance: "MATICUSDT",    logo: "https://cryptologos.cc/logos/polygon-matic-logo.png",                            desc: "Ethereum Layer-2 scaling solution." },
  { symbol: "LINK",  name: "Chainlink",             type: "crypto" as const, decimals: 8,  rank: 15,  price: "14.80",       change: "0.90",   binance: "LINKUSDT",     logo: "https://cryptologos.cc/logos/chainlink-link-logo.png",                           desc: "Decentralised oracle network." },
  { symbol: "LTC",   name: "Litecoin",              type: "crypto" as const, decimals: 8,  rank: 16,  price: "82.00",       change: "-0.20",  binance: "LTCUSDT",      logo: "https://cryptologos.cc/logos/litecoin-ltc-logo.png",                             desc: "Silver to Bitcoin's gold." },
  { symbol: "BCH",   name: "Bitcoin Cash",          type: "crypto" as const, decimals: 8,  rank: 17,  price: "385.00",      change: "0.70",   binance: "BCHUSDT",      logo: "https://cryptologos.cc/logos/bitcoin-cash-bch-logo.png",                         desc: "Bitcoin fork with larger blocks." },
  { symbol: "UNI",   name: "Uniswap",               type: "crypto" as const, decimals: 8,  rank: 19,  price: "9.80",        change: "1.50",   binance: "UNIUSDT",      logo: "https://cryptologos.cc/logos/uniswap-uni-logo.png",                              desc: "Leading DEX protocol on Ethereum." },
  { symbol: "XLM",   name: "Stellar",               type: "crypto" as const, decimals: 7,  rank: 20,  price: "0.112",       change: "0.30",   binance: "XLMUSDT",      logo: "https://cryptologos.cc/logos/stellar-xlm-logo.png",                              desc: "Cross-border payments network." },
  { symbol: "ATOM",  name: "Cosmos",                type: "crypto" as const, decimals: 6,  rank: 21,  price: "9.10",        change: "0.60",   binance: "ATOMUSDT",     logo: "https://cryptologos.cc/logos/cosmos-atom-logo.png",                              desc: "Internet of blockchains." },
  { symbol: "XMR",   name: "Monero",                type: "crypto" as const, decimals: 12, rank: 22,  price: "162.00",      change: "-0.40",  binance: "XMRUSDT",      logo: "https://cryptologos.cc/logos/monero-xmr-logo.png",                               desc: "Privacy-focused cryptocurrency." },
  { symbol: "ETC",   name: "Ethereum Classic",      type: "crypto" as const, decimals: 8,  rank: 23,  price: "26.50",       change: "0.80",   binance: "ETCUSDT",      logo: "https://cryptologos.cc/logos/ethereum-classic-etc-logo.png",                     desc: "Original Ethereum chain." },
  { symbol: "ALGO",  name: "Algorand",              type: "crypto" as const, decimals: 6,  rank: 24,  price: "0.175",       change: "0.20",   binance: "ALGOUSDT",     logo: "https://cryptologos.cc/logos/algorand-algo-logo.png",                            desc: "Pure proof-of-stake Layer-1." },
  { symbol: "VET",   name: "VeChain",               type: "crypto" as const, decimals: 8,  rank: 25,  price: "0.036",       change: "1.20",   binance: "VETUSDT",      logo: "https://cryptologos.cc/logos/vechain-vet-logo.png",                              desc: "Supply chain blockchain platform." },
  { symbol: "FTM",   name: "Fantom",                type: "crypto" as const, decimals: 8,  rank: 26,  price: "0.72",        change: "2.50",   binance: "FTMUSDT",      logo: "https://cryptologos.cc/logos/fantom-ftm-logo.png",                               desc: "High-speed DAG-based blockchain." },
  { symbol: "NEAR",  name: "NEAR Protocol",         type: "crypto" as const, decimals: 8,  rank: 27,  price: "6.90",        change: "1.80",   binance: "NEARUSDT",     logo: "https://cryptologos.cc/logos/near-protocol-near-logo.png",                       desc: "Sharded proof-of-stake Layer-1." },
  { symbol: "ICP",   name: "Internet Computer",     type: "crypto" as const, decimals: 8,  rank: 28,  price: "11.20",       change: "-1.10",  binance: "ICPUSDT",      logo: "https://cryptologos.cc/logos/internet-computer-icp-logo.png",                    desc: "Blockchain-based internet computer." },
  { symbol: "HBAR",  name: "Hedera",                type: "crypto" as const, decimals: 8,  rank: 29,  price: "0.105",       change: "0.90",   binance: "HBARUSDT",     logo: "https://cryptologos.cc/logos/hedera-hbar-logo.png",                              desc: "Enterprise-grade hashgraph network." },
  { symbol: "QNT",   name: "Quant",                 type: "crypto" as const, decimals: 8,  rank: 30,  price: "97.00",       change: "0.40",   binance: "QNTUSDT",      logo: "https://cryptologos.cc/logos/quant-qnt-logo.png",                                desc: "Blockchain interoperability OS." },
  { symbol: "APT",   name: "Aptos",                 type: "crypto" as const, decimals: 8,  rank: 31,  price: "8.90",        change: "2.10",   binance: "APTUSDT",      logo: "https://cryptologos.cc/logos/aptos-apt-logo.png",                                desc: "Next-gen Layer-1 from ex-Meta engineers." },
  { symbol: "ARB",   name: "Arbitrum",              type: "crypto" as const, decimals: 8,  rank: 32,  price: "1.08",        change: "1.40",   binance: "ARBUSDT",      logo: "https://cryptologos.cc/logos/arbitrum-arb-logo.png",                             desc: "Optimistic rollup Layer-2 for Ethereum." },
  { symbol: "OP",    name: "Optimism",              type: "crypto" as const, decimals: 8,  rank: 33,  price: "2.12",        change: "0.95",   binance: "OPUSDT",       logo: "https://cryptologos.cc/logos/optimism-ethereum-op-logo.png",                     desc: "Ethereum Layer-2 optimistic rollup." },
  { symbol: "MKR",   name: "Maker",                 type: "crypto" as const, decimals: 8,  rank: 34,  price: "2850.00",     change: "0.30",   binance: "MKRUSDT",      logo: "https://cryptologos.cc/logos/maker-mkr-logo.png",                                desc: "Governance token of MakerDAO." },
  { symbol: "AAVE",  name: "Aave",                  type: "crypto" as const, decimals: 8,  rank: 35,  price: "88.00",       change: "1.20",   binance: "AAVEUSDT",     logo: "https://cryptologos.cc/logos/aave-aave-logo.png",                                desc: "Decentralised lending protocol." },
  { symbol: "GRT",   name: "The Graph",             type: "crypto" as const, decimals: 8,  rank: 36,  price: "0.245",       change: "0.60",   binance: "GRTUSDT",      logo: "https://cryptologos.cc/logos/the-graph-grt-logo.png",                            desc: "Indexing protocol for blockchain data." },
  { symbol: "SNX",   name: "Synthetix",             type: "crypto" as const, decimals: 8,  rank: 37,  price: "2.80",        change: "-0.50",  binance: "SNXUSDT",      logo: "https://cryptologos.cc/logos/synthetix-network-token-snx-logo.png",             desc: "Synthetic assets protocol." },
  { symbol: "CRV",   name: "Curve DAO Token",       type: "crypto" as const, decimals: 8,  rank: 38,  price: "0.395",       change: "0.70",   binance: "CRVUSDT",      logo: "https://cryptologos.cc/logos/curve-dao-token-crv-logo.png",                      desc: "Stablecoin-focused DEX." },
  { symbol: "LDO",   name: "Lido DAO",              type: "crypto" as const, decimals: 8,  rank: 39,  price: "1.95",        change: "1.10",   binance: "LDOUSDT",      logo: "https://cryptologos.cc/logos/lido-dao-ldo-logo.png",                             desc: "Liquid staking for Ethereum." },
  { symbol: "RUNE",  name: "THORChain",             type: "crypto" as const, decimals: 8,  rank: 40,  price: "4.85",        change: "2.30",   binance: "RUNEUSDT",     logo: "https://cryptologos.cc/logos/thorchain-rune-logo.png",                           desc: "Cross-chain liquidity protocol." },
  { symbol: "INJ",   name: "Injective",             type: "crypto" as const, decimals: 8,  rank: 41,  price: "23.50",       change: "3.10",   binance: "INJUSDT",      logo: "https://cryptologos.cc/logos/injective-inj-logo.png",                            desc: "DeFi derivatives Layer-1." },
  { symbol: "SUI",   name: "Sui",                   type: "crypto" as const, decimals: 8,  rank: 42,  price: "1.02",        change: "4.20",   binance: "SUIUSDT",      logo: "https://cryptologos.cc/logos/sui-sui-logo.png",                                  desc: "Move-based Layer-1 by ex-Meta engineers." },
  { symbol: "SEI",   name: "Sei",                   type: "crypto" as const, decimals: 8,  rank: 43,  price: "0.48",        change: "1.80",   binance: "SEIUSDT",      logo: "https://cryptologos.cc/logos/sei-sei-logo.png",                                  desc: "First sector-specific Layer-1 for trading." },
  { symbol: "TIA",   name: "Celestia",              type: "crypto" as const, decimals: 8,  rank: 44,  price: "8.60",        change: "2.50",   binance: "TIAUSDT",      logo: "https://cryptologos.cc/logos/celestia-tia-logo.png",                             desc: "Modular data availability network." },
  { symbol: "JUP",   name: "Jupiter",               type: "crypto" as const, decimals: 6,  rank: 45,  price: "0.92",        change: "1.30",   binance: "JUPUSDT",      logo: "https://cryptologos.cc/logos/jupiter-jup-logo.png",                              desc: "Leading Solana DEX aggregator." },
  { symbol: "WIF",   name: "dogwifhat",             type: "crypto" as const, decimals: 6,  rank: 46,  price: "2.85",        change: "5.40",   binance: "WIFUSDT",      logo: "https://cryptologos.cc/logos/dogwifhat-wif-logo.png",                            desc: "Solana dog meme coin." },
  { symbol: "PEPE",  name: "Pepe",                  type: "crypto" as const, decimals: 18, rank: 47,  price: "0.0000113",   change: "6.80",   binance: "PEPEUSDT",     logo: "https://cryptologos.cc/logos/pepe-pepe-logo.png",                                desc: "Ethereum frog meme coin." },
  { symbol: "BONK",  name: "Bonk",                  type: "crypto" as const, decimals: 5,  rank: 48,  price: "0.0000253",   change: "4.10",   binance: "BONKUSDT",     logo: "https://cryptologos.cc/logos/bonk1-bonk-logo.png",                               desc: "Solana dog meme coin." },
  { symbol: "FIL",   name: "Filecoin",              type: "crypto" as const, decimals: 8,  rank: 49,  price: "5.80",        change: "-0.60",  binance: "FILUSDT",      logo: "https://cryptologos.cc/logos/filecoin-fil-logo.png",                             desc: "Decentralised storage network." },
  { symbol: "SAND",  name: "The Sandbox",           type: "crypto" as const, decimals: 8,  rank: 50,  price: "0.385",       change: "0.80",   binance: "SANDUSDT",     logo: "https://cryptologos.cc/logos/the-sandbox-sand-logo.png",                         desc: "Metaverse gaming platform." },
  { symbol: "MANA",  name: "Decentraland",          type: "crypto" as const, decimals: 8,  rank: 51,  price: "0.385",       change: "0.50",   binance: "MANAUSDT",     logo: "https://cryptologos.cc/logos/decentraland-mana-logo.png",                        desc: "Virtual world on Ethereum." },
  { symbol: "CHZ",   name: "Chiliz",                type: "crypto" as const, decimals: 8,  rank: 52,  price: "0.092",       change: "1.10",   binance: "CHZUSDT",      logo: "https://cryptologos.cc/logos/chiliz-chz-logo.png",                               desc: "Sports fan token platform." },
  { symbol: "ENS",   name: "Ethereum Name Service", type: "crypto" as const, decimals: 8,  rank: 53,  price: "17.50",       change: "0.90",   binance: "ENSUSDT",      logo: "https://cryptologos.cc/logos/ethereum-name-service-ens-logo.png",                desc: "Decentralised naming for wallets and websites." },
  { symbol: "APE",   name: "ApeCoin",               type: "crypto" as const, decimals: 8,  rank: 54,  price: "1.12",        change: "2.10",   binance: "APEUSDT",      logo: "https://cryptologos.cc/logos/apecoin-ape-logo.png",                              desc: "BAYC ecosystem governance token." },
  { symbol: "GALA",  name: "Gala",                  type: "crypto" as const, decimals: 8,  rank: 55,  price: "0.038",       change: "3.50",   binance: "GALAUSDT",     logo: "https://cryptologos.cc/logos/gala-gala-logo.png",                                desc: "Blockchain gaming ecosystem." },
  { symbol: "ROSE",  name: "Oasis Network",         type: "crypto" as const, decimals: 9,  rank: 56,  price: "0.089",       change: "1.30",   binance: "ROSEUSDT",     logo: "https://cryptologos.cc/logos/oasis-network-rose-logo.png",                       desc: "Privacy-enabled smart contract platform." },
  { symbol: "KAVA",  name: "Kava",                  type: "crypto" as const, decimals: 6,  rank: 57,  price: "0.72",        change: "0.60",   binance: "KAVAUSDT",     logo: "https://cryptologos.cc/logos/kava-kava-logo.png",                                desc: "Cross-chain DeFi platform." },
  { symbol: "ONE",   name: "Harmony",               type: "crypto" as const, decimals: 18, rank: 58,  price: "0.0145",      change: "0.80",   binance: "ONEUSDT",      logo: "https://cryptologos.cc/logos/harmony-one-logo.png",                              desc: "Fast sharded blockchain." },
  { symbol: "ZIL",   name: "Zilliqa",               type: "crypto" as const, decimals: 12, rank: 59,  price: "0.022",       change: "0.40",   binance: "ZILUSDT",      logo: "https://cryptologos.cc/logos/zilliqa-zil-logo.png",                              desc: "Sharded blockchain protocol." },
  { symbol: "IOTA",  name: "IOTA",                  type: "crypto" as const, decimals: 6,  rank: 60,  price: "0.225",       change: "-0.20",  binance: "IOTAUSDT",     logo: "https://cryptologos.cc/logos/iota-iota-logo.png",                                desc: "Feeless DLT for IoT." },
  { symbol: "EOS",   name: "EOS",                   type: "crypto" as const, decimals: 4,  rank: 61,  price: "0.75",        change: "0.30",   binance: "EOSUSDT",      logo: "https://cryptologos.cc/logos/eos-eos-logo.png",                                  desc: "High-throughput dApp platform." },
  { symbol: "XTZ",   name: "Tezos",                 type: "crypto" as const, decimals: 6,  rank: 62,  price: "0.90",        change: "0.20",   binance: "XTZUSDT",      logo: "https://cryptologos.cc/logos/tezos-xtz-logo.png",                                desc: "Self-amending blockchain." },
  { symbol: "WAVES", name: "Waves",                 type: "crypto" as const, decimals: 8,  rank: 63,  price: "2.10",        change: "1.60",   binance: "WAVESUSDT",    logo: "https://cryptologos.cc/logos/waves-waves-logo.png",                              desc: "Decentralised platform for dApps and tokens." },
  { symbol: "ICX",   name: "ICON",                  type: "crypto" as const, decimals: 18, rank: 64,  price: "0.195",       change: "0.70",   binance: "ICXUSDT",      logo: "https://cryptologos.cc/logos/icon-icx-logo.png",                                 desc: "Hyperconnect the world blockchain." },
  { symbol: "ZEC",   name: "Zcash",                 type: "crypto" as const, decimals: 8,  rank: 65,  price: "22.50",       change: "-0.90",  binance: "ZECUSDT",      logo: "https://cryptologos.cc/logos/zcash-zec-logo.png",                                desc: "Privacy-first cryptocurrency." },
  { symbol: "DASH",  name: "Dash",                  type: "crypto" as const, decimals: 8,  rank: 66,  price: "30.80",       change: "0.50",   binance: "DASHUSDT",     logo: "https://cryptologos.cc/logos/dash-dash-logo.png",                                desc: "Digital cash with instant transactions." },
  { symbol: "BAT",   name: "Basic Attention Token", type: "crypto" as const, decimals: 18, rank: 67,  price: "0.245",       change: "0.80",   binance: "BATUSDT",      logo: "https://cryptologos.cc/logos/basic-attention-token-bat-logo.png",                desc: "Brave browser advertising token." },
  { symbol: "COMP",  name: "Compound",              type: "crypto" as const, decimals: 18, rank: 68,  price: "52.00",       change: "0.60",   binance: "COMPUSDT",     logo: "https://cryptologos.cc/logos/compound-comp-logo.png",                            desc: "Algorithmic lending protocol." },
  { symbol: "YFI",   name: "yearn.finance",         type: "crypto" as const, decimals: 18, rank: 69,  price: "7200.00",     change: "1.20",   binance: "YFIUSDT",      logo: "https://cryptologos.cc/logos/yearn-finance-yfi-logo.png",                        desc: "DeFi yield optimiser." },
  { symbol: "1INCH", name: "1inch",                 type: "crypto" as const, decimals: 18, rank: 70,  price: "0.385",       change: "1.80",   binance: "1INCHUSDT",    logo: "https://cryptologos.cc/logos/1inch-1inch-logo.png",                              desc: "DEX aggregator protocol." },
  { symbol: "SUSHI", name: "SushiSwap",             type: "crypto" as const, decimals: 18, rank: 71,  price: "1.05",        change: "1.40",   binance: "SUSHIUSDT",    logo: "https://cryptologos.cc/logos/sushiswap-sushi-logo.png",                          desc: "Community-driven DEX." },
  { symbol: "ZEN",   name: "Horizen",               type: "crypto" as const, decimals: 8,  rank: 72,  price: "10.20",       change: "0.40",   binance: "ZENUSDT",      logo: "https://cryptologos.cc/logos/horizen-zen-logo.png",                              desc: "Privacy sidechain platform." },
  { symbol: "ANKR",  name: "Ankr",                  type: "crypto" as const, decimals: 18, rank: 73,  price: "0.038",       change: "0.90",   binance: "ANKRUSDT",     logo: "https://cryptologos.cc/logos/ankr-ankr-logo.png",                                desc: "Decentralised cloud infrastructure." },
  { symbol: "AUDIO", name: "Audius",                type: "crypto" as const, decimals: 18, rank: 74,  price: "0.175",       change: "2.20",   binance: "AUDIOUSDT",    logo: "https://cryptologos.cc/logos/audius-audio-logo.png",                             desc: "Decentralised music streaming." },
  { symbol: "SKL",   name: "SKALE",                 type: "crypto" as const, decimals: 18, rank: 75,  price: "0.068",       change: "1.10",   binance: "SKLUSDT",      logo: "https://cryptologos.cc/logos/skale-skl-logo.png",                                desc: "Elastic blockchain network." },
  { symbol: "BAND",  name: "Band Protocol",         type: "crypto" as const, decimals: 18, rank: 76,  price: "1.35",        change: "0.60",   binance: "BANDUSDT",     logo: "https://cryptologos.cc/logos/band-protocol-band-logo.png",                       desc: "Cross-chain data oracle platform." },
  { symbol: "OCEAN", name: "Ocean Protocol",        type: "crypto" as const, decimals: 18, rank: 77,  price: "0.885",       change: "2.80",   binance: "OCEANUSDT",    logo: "https://cryptologos.cc/logos/ocean-protocol-ocean-logo.png",                     desc: "Decentralised data marketplace." },
  { symbol: "CELR",  name: "Celer Network",         type: "crypto" as const, decimals: 18, rank: 78,  price: "0.026",       change: "1.00",   binance: "CELRUSDT",     logo: "https://cryptologos.cc/logos/celer-network-celr-logo.png",                       desc: "Layer-2 scaling and bridging." },
  { symbol: "REN",   name: "Ren",                   type: "crypto" as const, decimals: 8,  rank: 79,  price: "0.052",       change: "0.30",   binance: "RENUSDT",      logo: "https://cryptologos.cc/logos/ren-ren-logo.png",                                  desc: "Cross-chain asset protocol." },
  { symbol: "KNC",   name: "Kyber Network Crystal", type: "crypto" as const, decimals: 18, rank: 80,  price: "0.615",       change: "0.70",   binance: "KNCUSDT",      logo: "https://cryptologos.cc/logos/kyber-network-knc-logo.png",                        desc: "On-chain liquidity protocol." },
  { symbol: "BAL",   name: "Balancer",              type: "crypto" as const, decimals: 18, rank: 81,  price: "3.20",        change: "0.80",   binance: "BALUSDT",      logo: "https://cryptologos.cc/logos/balancer-bal-logo.png",                             desc: "Automated portfolio manager and DEX." },
  { symbol: "UMA",   name: "UMA",                   type: "crypto" as const, decimals: 18, rank: 82,  price: "2.55",        change: "1.20",   binance: "UMAUSDT",      logo: "https://cryptologos.cc/logos/uma-uma-logo.png",                                  desc: "Optimistic oracle for DeFi." },
  { symbol: "NMR",   name: "Numeraire",             type: "crypto" as const, decimals: 18, rank: 83,  price: "18.50",       change: "0.40",   binance: "NMRUSDT",      logo: "https://cryptologos.cc/logos/numeraire-nmr-logo.png",                            desc: "Machine learning hedge fund token." },
  { symbol: "STORJ", name: "Storj",                 type: "crypto" as const, decimals: 8,  rank: 84,  price: "0.520",       change: "1.50",   binance: "STORJUSDT",    logo: "https://cryptologos.cc/logos/storj-storj-logo.png",                              desc: "Decentralised cloud storage." },
  { symbol: "FLUX",  name: "Flux",                  type: "crypto" as const, decimals: 8,  rank: 85,  price: "0.680",       change: "2.10",   binance: "FLUXUSDT",     logo: "https://cryptologos.cc/logos/flux-flux-logo.png",                                desc: "Decentralised cloud computing." },
  { symbol: "DYDX",  name: "dYdX",                  type: "crypto" as const, decimals: 18, rank: 86,  price: "1.85",        change: "2.60",   binance: "DYDXUSDT",     logo: "https://cryptologos.cc/logos/dydx-dydx-logo.png",                                desc: "Decentralised perpetuals exchange." },
  { symbol: "PERP",  name: "Perpetual Protocol",    type: "crypto" as const, decimals: 18, rank: 87,  price: "0.970",       change: "1.80",   binance: "PERPUSDT",     logo: "https://cryptologos.cc/logos/perpetual-protocol-perp-logo.png",                  desc: "On-chain perpetual futures." },
  { symbol: "CTSI",  name: "Cartesi",               type: "crypto" as const, decimals: 18, rank: 88,  price: "0.195",       change: "1.10",   binance: "CTSIUSDT",     logo: "https://cryptologos.cc/logos/cartesi-ctsi-logo.png",                             desc: "OS-level DeFi infrastructure." },
  { symbol: "COTI",  name: "COTI",                  type: "crypto" as const, decimals: 8,  rank: 89,  price: "0.135",       change: "0.90",   binance: "COTIUSDT",     logo: "https://cryptologos.cc/logos/coti-coti-logo.png",                                desc: "Enterprise-grade fintech blockchain." },
  { symbol: "DENT",  name: "Dent",                  type: "crypto" as const, decimals: 8,  rank: 90,  price: "0.00082",     change: "0.50",   binance: "DENTUSDT",     logo: "https://cryptologos.cc/logos/dent-dent-logo.png",                                desc: "Mobile data exchange platform." },
  { symbol: "HOT",   name: "Holo",                  type: "crypto" as const, decimals: 9,  rank: 91,  price: "0.00185",     change: "1.30",   binance: "HOTUSDT",      logo: "https://cryptologos.cc/logos/holo-hot-logo.png",                                 desc: "Distributed cloud hosting." },
  { symbol: "WIN",   name: "WINkLink",              type: "crypto" as const, decimals: 6,  rank: 92,  price: "0.0000685",   change: "0.80",   binance: "WINUSDT",      logo: "https://cryptologos.cc/logos/wink-win-logo.png",                                 desc: "TRON-based oracle network." },
  { symbol: "LSK",   name: "Lisk",                  type: "crypto" as const, decimals: 8,  rank: 93,  price: "1.52",        change: "0.60",   binance: "LSKUSDT",      logo: "https://cryptologos.cc/logos/lisk-lsk-logo.png",                                 desc: "JavaScript blockchain platform." },
  { symbol: "FET",   name: "Fetch.ai",              type: "crypto" as const, decimals: 18, rank: 94,  price: "1.52",        change: "2.40",   binance: "FETUSDT",      logo: "https://cryptologos.cc/logos/fetch-ai-fet-logo.png",                             desc: "AI-powered autonomous agents blockchain." },
  { symbol: "AGIX",  name: "SingularityNET",        type: "crypto" as const, decimals: 8,  rank: 95,  price: "0.725",       change: "1.80",   binance: "AGIXUSDT",     logo: "https://cryptologos.cc/logos/singularitynet-agix-logo.png",                      desc: "Decentralised AI marketplace." },
  { symbol: "RNDR",  name: "Render",                type: "crypto" as const, decimals: 18, rank: 96,  price: "7.80",        change: "3.20",   binance: "RNDRUSDT",     logo: "https://cryptologos.cc/logos/render-token-rndr-logo.png",                        desc: "Decentralised GPU rendering network." },
  { symbol: "PHA",   name: "Phala Network",         type: "crypto" as const, decimals: 12, rank: 97,  price: "0.145",       change: "1.40",   binance: "PHAUSDT",      logo: "https://cryptologos.cc/logos/phala-network-pha-logo.png",                        desc: "Confidential computing cloud." },
  { symbol: "LOOM",  name: "Loom Network",          type: "crypto" as const, decimals: 18, rank: 98,  price: "0.072",       change: "0.50",   binance: "LOOMUSDT",     logo: "https://cryptologos.cc/logos/loom-network-old-loom-logo.png",                    desc: "Multi-chain gaming and DeFi." },
  { symbol: "MTL",   name: "Metal DAO",             type: "crypto" as const, decimals: 8,  rank: 99,  price: "1.28",        change: "0.90",   binance: "MTLUSDT",      logo: "https://cryptologos.cc/logos/metal-mtl-logo.png",                                desc: "Payments and banking crypto." },
  { symbol: "SXP",   name: "Solar",                 type: "crypto" as const, decimals: 18, rank: 100, price: "0.320",       change: "0.60",   binance: "SXPUSDT",      logo: "https://cryptologos.cc/logos/solarbeam-solar-logo.png",                          desc: "Swipe/Solar payments DeFi token." },
];

// ─── Pair definitions ─────────────────────────────────────────────────────────

const USDT_PAIRS = COINS.filter(c => c.type === "crypto").map(c => c.symbol);

const BTC_PAIRS = [
  "ETH","BNB","SOL","XRP","ADA","AVAX","DOGE","TRX","DOT","MATIC",
  "LINK","LTC","BCH","UNI","XLM","ATOM","ETC","ALGO","VET","FTM",
  "NEAR","ICP","HBAR","APT","ARB","OP","INJ","SUI","SEI","TIA",
];

const INR_PAIRS = [
  "BTC","ETH","BNB","SOL","XRP","ADA","AVAX","DOGE","MATIC","LINK",
  "LTC","DOT","UNI","BCH","ATOM","NEAR","ARB","INJ","TRX","ICP",
];

// ─── Seed logic ───────────────────────────────────────────────────────────────

async function seedCoins() {
  console.log(`\n📦 Seeding ${COINS.length} coins...`);

  const values = COINS.map(c => ({
    symbol:         c.symbol,
    name:           c.name,
    type:           c.type,
    decimals:       c.decimals,
    logoUrl:        c.logo,
    description:    c.desc,
    status:         "active" as const,
    isListed:       true,
    marketCapRank:  c.rank,
    currentPrice:   c.price,
    change24h:      c.change,
    binanceSymbol:  c.binance ?? undefined,
    priceSource:    "binance" as const,
  }));

  await db
    .insert(coinsTable)
    .values(values)
    .onConflictDoUpdate({
      target: coinsTable.symbol,
      set: {
        name:          sql`EXCLUDED.name`,
        type:          sql`EXCLUDED.type`,
        decimals:      sql`EXCLUDED.decimals`,
        logoUrl:       sql`EXCLUDED.logo_url`,
        description:   sql`EXCLUDED.description`,
        status:        sql`EXCLUDED.status`,
        isListed:      sql`EXCLUDED.is_listed`,
        marketCapRank: sql`EXCLUDED.market_cap_rank`,
        currentPrice:  sql`EXCLUDED.current_price`,
        change24h:     sql`EXCLUDED.change_24h`,
        binanceSymbol: sql`EXCLUDED.binance_symbol`,
        priceSource:   sql`EXCLUDED.price_source`,
        updatedAt:     sql`now()`,
      },
    });

  console.log(`   ✅ ${COINS.length} coins upserted.`);
}

async function seedPairs() {
  console.log("\n📊 Seeding trading pairs...");

  const allCoins = await db.select({ id: coinsTable.id, symbol: coinsTable.symbol }).from(coinsTable);
  const bySymbol = Object.fromEntries(allCoins.map(c => [c.symbol, c.id]));

  const usdtId = bySymbol["USDT"];
  const btcId  = bySymbol["BTC"];
  const inrId  = bySymbol["INR"];

  if (!usdtId || !btcId || !inrId) {
    throw new Error("USDT / BTC / INR coins not found — run coin seed first.");
  }

  const pairRows: typeof pairsTable.$inferInsert[] = [];

  const add = (
    baseSymbol: string,
    quoteCoinId: number,
    quoteSymbol: string,
    pricePrecision = 4,
    qtyPrecision   = 4,
  ) => {
    const baseCoinId = bySymbol[baseSymbol];
    if (!baseCoinId) return;
    pairRows.push({
      symbol:               `${baseSymbol}${quoteSymbol}`,
      baseCoinId,
      quoteCoinId,
      minQty:               "0.001",
      maxQty:               "999999",
      pricePrecision,
      qtyPrecision,
      takerFee:             "0.001",
      makerFee:             "0.001",
      tradingEnabled:       true,
      futuresEnabled:       false,
      lastPrice:            "0",
      volume24h:            "0",
      quoteVolume24h:       "0",
      high24h:              "0",
      low24h:               "0",
      change24h:            "0",
      trades24h:            0,
      status:               "active",
      maxLeverage:          100,
      mmRate:               "0.005",
      fundingIntervalHours: 8,
      baseFundingRate:      "0.0001",
      fundingAutoCreate:    "true",
    });
  };

  for (const sym of USDT_PAIRS) add(sym, usdtId, "USDT", sym === "BTC" ? 2 : 4);
  for (const sym of BTC_PAIRS)  add(sym, btcId,  "BTC",  8);
  for (const sym of INR_PAIRS)  add(sym, inrId,  "INR",  2);

  console.log(`   Preparing ${pairRows.length} pairs (USDT:${USDT_PAIRS.length} BTC:${BTC_PAIRS.length} INR:${INR_PAIRS.length})...`);

  await db
    .insert(pairsTable)
    .values(pairRows)
    .onConflictDoUpdate({
      target: pairsTable.symbol,
      set: {
        baseCoinId:     sql`EXCLUDED.base_coin_id`,
        quoteCoinId:    sql`EXCLUDED.quote_coin_id`,
        tradingEnabled: sql`EXCLUDED.trading_enabled`,
        status:         sql`EXCLUDED.status`,
      },
    });

  console.log(`   ✅ ${pairRows.length} pairs upserted.`);
}

// ─── Network definitions per coin ─────────────────────────────────────────────
// Each entry: { coinSymbol, name, chain, contractAddress?, minDeposit, minWithdraw, withdrawFee, confirmations }
const NETWORKS: Array<{
  coin: string; name: string; chain: string; contract?: string;
  minDep?: string; minWith?: string; fee?: string; confs?: number; explorer?: string;
}> = [
  // BTC
  { coin: "BTC",   name: "Bitcoin",          chain: "BTC",      confs: 3,  minDep: "0.0001",  minWith: "0.0005",  fee: "0.0002",   explorer: "https://blockchair.com/bitcoin/transaction/{txid}" },
  // ETH
  { coin: "ETH",   name: "Ethereum (ERC-20)", chain: "ETH",      confs: 12, minDep: "0.002",   minWith: "0.01",    fee: "0.003",    explorer: "https://etherscan.io/tx/{txid}" },
  { coin: "ETH",   name: "Arbitrum One",      chain: "ARBITRUM", confs: 10, minDep: "0.001",   minWith: "0.005",   fee: "0.001",    explorer: "https://arbiscan.io/tx/{txid}" },
  { coin: "ETH",   name: "Optimism",          chain: "OPTIMISM", confs: 10, minDep: "0.001",   minWith: "0.005",   fee: "0.001",    explorer: "https://optimistic.etherscan.io/tx/{txid}" },
  // BNB
  { coin: "BNB",   name: "BNB Chain (BEP-20)",chain: "BNB",      confs: 15, minDep: "0.01",    minWith: "0.05",    fee: "0.001",    explorer: "https://bscscan.com/tx/{txid}" },
  // SOL
  { coin: "SOL",   name: "Solana",            chain: "SOL",      confs: 1,  minDep: "0.01",    minWith: "0.05",    fee: "0.001",    explorer: "https://solscan.io/tx/{txid}" },
  // XRP
  { coin: "XRP",   name: "XRP Ledger",        chain: "XRP",      confs: 6,  minDep: "0.1",     minWith: "5",       fee: "0.25",     explorer: "https://xrpscan.com/tx/{txid}" },
  // ADA
  { coin: "ADA",   name: "Cardano",           chain: "ADA",      confs: 15, minDep: "2",       minWith: "5",       fee: "1",        explorer: "https://cardanoscan.io/transaction/{txid}" },
  // AVAX
  { coin: "AVAX",  name: "Avalanche C-Chain", chain: "AVAX",     confs: 12, minDep: "0.1",     minWith: "0.5",     fee: "0.01",     explorer: "https://snowtrace.io/tx/{txid}" },
  // DOGE
  { coin: "DOGE",  name: "Dogecoin",          chain: "DOGE",     confs: 6,  minDep: "10",      minWith: "50",      fee: "2",        explorer: "https://blockchair.com/dogecoin/transaction/{txid}" },
  // TRX
  { coin: "TRX",   name: "TRON (TRC-20)",     chain: "TRX",      confs: 20, minDep: "1",       minWith: "10",      fee: "1",        explorer: "https://tronscan.org/#/transaction/{txid}" },
  // DOT
  { coin: "DOT",   name: "Polkadot",          chain: "DOT",      confs: 12, minDep: "0.1",     minWith: "1",       fee: "0.1",      explorer: "https://polkascan.io/polkadot/transaction/{txid}" },
  // MATIC / Polygon
  { coin: "MATIC", name: "Polygon (MATIC)",   chain: "POLYGON",  confs: 128,minDep: "1",       minWith: "5",       fee: "0.1",      explorer: "https://polygonscan.com/tx/{txid}" },
  { coin: "MATIC", name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0", confs: 12, minDep: "1", minWith: "5", fee: "1", explorer: "https://etherscan.io/tx/{txid}" },
  // LINK
  { coin: "LINK",  name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0x514910771af9ca656af840dff83e8264ecf986ca", confs: 12, minDep: "0.5", minWith: "2", fee: "0.3", explorer: "https://etherscan.io/tx/{txid}" },
  { coin: "LINK",  name: "BNB Chain (BEP-20)",chain: "BNB",      contract: "0xf8a0bf9cf54bb92f17374d9e9a321e6a111a51bd", confs: 15, minDep: "0.5", minWith: "2", fee: "0.1", explorer: "https://bscscan.com/tx/{txid}" },
  // LTC
  { coin: "LTC",   name: "Litecoin",          chain: "LTC",      confs: 4,  minDep: "0.01",    minWith: "0.05",    fee: "0.002",    explorer: "https://blockchair.com/litecoin/transaction/{txid}" },
  // BCH
  { coin: "BCH",   name: "Bitcoin Cash",      chain: "BCH",      confs: 6,  minDep: "0.001",   minWith: "0.005",   fee: "0.001",    explorer: "https://blockchair.com/bitcoin-cash/transaction/{txid}" },
  // USDT — multi-network stablecoin
  { coin: "USDT",  name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0xdac17f958d2ee523a2206206994597c13d831ec7", confs: 12, minDep: "5",  minWith: "20",  fee: "2",    explorer: "https://etherscan.io/tx/{txid}" },
  { coin: "USDT",  name: "TRON (TRC-20)",     chain: "TRX",      contract: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",        confs: 20, minDep: "1",  minWith: "5",   fee: "1",    explorer: "https://tronscan.org/#/transaction/{txid}" },
  { coin: "USDT",  name: "BNB Chain (BEP-20)",chain: "BNB",      contract: "0x55d398326f99059ff775485246999027b3197955", confs: 15, minDep: "1",  minWith: "5",   fee: "0.5",  explorer: "https://bscscan.com/tx/{txid}" },
  { coin: "USDT",  name: "Solana (SPL)",      chain: "SOL",      contract: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", confs: 1, minDep: "1", minWith: "5",   fee: "0.1",  explorer: "https://solscan.io/tx/{txid}" },
  { coin: "USDT",  name: "Polygon",           chain: "POLYGON",  contract: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", confs: 128,minDep: "1",  minWith: "5",   fee: "0.5",  explorer: "https://polygonscan.com/tx/{txid}" },
  { coin: "USDT",  name: "Arbitrum",          chain: "ARBITRUM", contract: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", confs: 10, minDep: "1",  minWith: "5",   fee: "0.2",  explorer: "https://arbiscan.io/tx/{txid}" },
  // USDC — multi-network stablecoin
  { coin: "USDC",  name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", confs: 12, minDep: "5",  minWith: "20",  fee: "2",    explorer: "https://etherscan.io/tx/{txid}" },
  { coin: "USDC",  name: "BNB Chain (BEP-20)",chain: "BNB",      contract: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", confs: 15, minDep: "1",  minWith: "5",   fee: "0.5",  explorer: "https://bscscan.com/tx/{txid}" },
  { coin: "USDC",  name: "Solana (SPL)",      chain: "SOL",      contract: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", confs: 1, minDep: "1", minWith: "5",   fee: "0.1",  explorer: "https://solscan.io/tx/{txid}" },
  { coin: "USDC",  name: "Polygon",           chain: "POLYGON",  contract: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174", confs: 128,minDep: "1",  minWith: "5",   fee: "0.5",  explorer: "https://polygonscan.com/tx/{txid}" },
  // UNI
  { coin: "UNI",   name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984", confs: 12, minDep: "0.5", minWith: "2",   fee: "0.3",  explorer: "https://etherscan.io/tx/{txid}" },
  { coin: "UNI",   name: "BNB Chain (BEP-20)",chain: "BNB",      contract: "0xbf5140a22578168fd562dccf235e5d43a02ce9b1", confs: 15, minDep: "0.5", minWith: "2",   fee: "0.1",  explorer: "https://bscscan.com/tx/{txid}" },
  // XLM
  { coin: "XLM",   name: "Stellar",           chain: "XLM",      confs: 5,  minDep: "1",       minWith: "5",       fee: "0.1",      explorer: "https://stellar.expert/explorer/public/tx/{txid}" },
  // ATOM
  { coin: "ATOM",  name: "Cosmos",            chain: "ATOM",     confs: 6,  minDep: "0.01",    minWith: "0.1",     fee: "0.01",     explorer: "https://www.mintscan.io/cosmos/txs/{txid}" },
  // XMR
  { coin: "XMR",   name: "Monero",            chain: "XMR",      confs: 10, minDep: "0.01",    minWith: "0.05",    fee: "0.0001",   explorer: "https://xmrchain.net/tx/{txid}" },
  // ETC
  { coin: "ETC",   name: "Ethereum Classic",  chain: "ETC",      confs: 20, minDep: "0.01",    minWith: "0.1",     fee: "0.01",     explorer: "https://blockscout.com/etc/mainnet/tx/{txid}" },
  // ALGO
  { coin: "ALGO",  name: "Algorand",          chain: "ALGO",     confs: 1,  minDep: "1",       minWith: "5",       fee: "0.01",     explorer: "https://algoexplorer.io/tx/{txid}" },
  // VET
  { coin: "VET",   name: "VeChain",           chain: "VET",      confs: 20, minDep: "10",      minWith: "100",     fee: "20",       explorer: "https://explore.vechain.org/transactions/{txid}" },
  // FTM
  { coin: "FTM",   name: "Fantom (FTM)",      chain: "FTM",      confs: 5,  minDep: "1",       minWith: "10",      fee: "0.5",      explorer: "https://ftmscan.com/tx/{txid}" },
  { coin: "FTM",   name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0x4e15361fd6b4bb609fa63c81a2be19d873717870", confs: 12, minDep: "1", minWith: "10",  fee: "1",    explorer: "https://etherscan.io/tx/{txid}" },
  // NEAR
  { coin: "NEAR",  name: "NEAR Protocol",     chain: "NEAR",     confs: 1,  minDep: "0.1",     minWith: "1",       fee: "0.05",     explorer: "https://nearblocks.io/txns/{txid}" },
  // ICP
  { coin: "ICP",   name: "Internet Computer", chain: "ICP",      confs: 1,  minDep: "0.1",     minWith: "1",       fee: "0.001",    explorer: "https://dashboard.internetcomputer.org/transaction/{txid}" },
  // HBAR
  { coin: "HBAR",  name: "Hedera",            chain: "HBAR",     confs: 1,  minDep: "1",       minWith: "10",      fee: "0.05",     explorer: "https://hashscan.io/mainnet/transaction/{txid}" },
  // APT
  { coin: "APT",   name: "Aptos",             chain: "APT",      confs: 1,  minDep: "0.1",     minWith: "1",       fee: "0.001",    explorer: "https://aptoscan.com/transaction/{txid}" },
  // ARB
  { coin: "ARB",   name: "Arbitrum One",      chain: "ARBITRUM", contract: "0x912ce59144191c1204e64559fe8253a0e49e6548", confs: 10, minDep: "1", minWith: "5", fee: "0.2", explorer: "https://arbiscan.io/tx/{txid}" },
  // OP
  { coin: "OP",    name: "Optimism",          chain: "OPTIMISM", contract: "0x4200000000000000000000000000000000000042", confs: 10, minDep: "1", minWith: "5", fee: "0.2", explorer: "https://optimistic.etherscan.io/tx/{txid}" },
  // MKR
  { coin: "MKR",   name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2", confs: 12, minDep: "0.001", minWith: "0.005", fee: "0.001", explorer: "https://etherscan.io/tx/{txid}" },
  // AAVE
  { coin: "AAVE",  name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9", confs: 12, minDep: "0.05", minWith: "0.2", fee: "0.01", explorer: "https://etherscan.io/tx/{txid}" },
  { coin: "AAVE",  name: "Polygon",           chain: "POLYGON",  contract: "0xd6df932a45c0f255f85145f286ea0b292b21c90b", confs: 128,minDep: "0.05", minWith: "0.2", fee: "0.005", explorer: "https://polygonscan.com/tx/{txid}" },
  // GRT
  { coin: "GRT",   name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0xc944e90c64b2c07662a292be6244bdf05cda44a7", confs: 12, minDep: "5", minWith: "20", fee: "2", explorer: "https://etherscan.io/tx/{txid}" },
  // INJ
  { coin: "INJ",   name: "Injective",         chain: "INJ",      confs: 1,  minDep: "0.1",     minWith: "1",       fee: "0.005",    explorer: "https://explorer.injective.network/transaction/{txid}" },
  { coin: "INJ",   name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0xe28b3b32b6c345a34ff64674606124dd5aceca30", confs: 12, minDep: "0.1", minWith: "1", fee: "0.05", explorer: "https://etherscan.io/tx/{txid}" },
  // SUI
  { coin: "SUI",   name: "Sui",               chain: "SUI",      confs: 1,  minDep: "0.1",     minWith: "1",       fee: "0.01",     explorer: "https://suiexplorer.com/txblock/{txid}" },
  // SEI
  { coin: "SEI",   name: "Sei",               chain: "SEI",      confs: 1,  minDep: "1",       minWith: "5",       fee: "0.1",      explorer: "https://www.seiscan.app/pacific-1/txs/{txid}" },
  // TIA
  { coin: "TIA",   name: "Celestia",          chain: "TIA",      confs: 1,  minDep: "0.1",     minWith: "1",       fee: "0.01",     explorer: "https://celenium.io/tx/{txid}" },
  // JUP
  { coin: "JUP",   name: "Solana (SPL)",      chain: "SOL",      contract: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", confs: 1, minDep: "1", minWith: "5", fee: "0.1", explorer: "https://solscan.io/tx/{txid}" },
  // WIF
  { coin: "WIF",   name: "Solana (SPL)",      chain: "SOL",      contract: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm", confs: 1, minDep: "1", minWith: "5", fee: "0.1", explorer: "https://solscan.io/tx/{txid}" },
  // PEPE
  { coin: "PEPE",  name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0x6982508145454ce325ddbe47a25d4ec3d2311933", confs: 12, minDep: "100000", minWith: "500000", fee: "50000", explorer: "https://etherscan.io/tx/{txid}" },
  // BONK
  { coin: "BONK",  name: "Solana (SPL)",      chain: "SOL",      contract: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", confs: 1, minDep: "10000", minWith: "50000", fee: "5000", explorer: "https://solscan.io/tx/{txid}" },
  // FIL
  { coin: "FIL",   name: "Filecoin",          chain: "FIL",      confs: 5,  minDep: "0.1",     minWith: "1",       fee: "0.05",     explorer: "https://filfox.info/en/tx/{txid}" },
  // ZEC
  { coin: "ZEC",   name: "Zcash",             chain: "ZEC",      confs: 5,  minDep: "0.01",    minWith: "0.05",    fee: "0.001",    explorer: "https://blockchair.com/zcash/transaction/{txid}" },
  // DASH
  { coin: "DASH",  name: "Dash",              chain: "DASH",     confs: 6,  minDep: "0.01",    minWith: "0.05",    fee: "0.002",    explorer: "https://blockchair.com/dash/transaction/{txid}" },
  // LDO
  { coin: "LDO",   name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0x5a98fcbea516cf06857215779fd812ca3bef1b32", confs: 12, minDep: "5", minWith: "20", fee: "2", explorer: "https://etherscan.io/tx/{txid}" },
  // RUNE
  { coin: "RUNE",  name: "THORChain",         chain: "THOR",     confs: 1,  minDep: "0.1",     minWith: "1",       fee: "0.02",     explorer: "https://thorchain.net/tx/{txid}" },
  // DYDX
  { coin: "DYDX",  name: "dYdX Chain",        chain: "DYDX",     confs: 1,  minDep: "1",       minWith: "5",       fee: "0.5",      explorer: "https://www.mintscan.io/dydx/txs/{txid}" },
  { coin: "DYDX",  name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0x92d6c1e31e14520e676a687f0a93788b716beff5", confs: 12, minDep: "1", minWith: "5", fee: "0.5", explorer: "https://etherscan.io/tx/{txid}" },
  // FET
  { coin: "FET",   name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0xaea46a60368a7bd060eec7df8cba43b7ef41ad85", confs: 12, minDep: "5", minWith: "20", fee: "2", explorer: "https://etherscan.io/tx/{txid}" },
  // RNDR
  { coin: "RNDR",  name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0x6de037ef9ad2725eb40118bb1702ebb27e4aeb24", confs: 12, minDep: "1", minWith: "5", fee: "0.5", explorer: "https://etherscan.io/tx/{txid}" },
  { coin: "RNDR",  name: "Solana (SPL)",      chain: "SOL",      contract: "rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof", confs: 1, minDep: "1", minWith: "5", fee: "0.1", explorer: "https://solscan.io/tx/{txid}" },
  // AGIX
  { coin: "AGIX",  name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0x5b7533812759b45c2b44c19e320ba2cd2681b542", confs: 12, minDep: "5", minWith: "20", fee: "2", explorer: "https://etherscan.io/tx/{txid}" },
  // BAT
  { coin: "BAT",   name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0x0d8775f648430679a709e98d2b0cb6250d2887ef", confs: 12, minDep: "5", minWith: "20", fee: "2", explorer: "https://etherscan.io/tx/{txid}" },
  // COMP
  { coin: "COMP",  name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0xc00e94cb662c3520282e6f5717214004a7f26888", confs: 12, minDep: "0.01", minWith: "0.05", fee: "0.005", explorer: "https://etherscan.io/tx/{txid}" },
  // CRV
  { coin: "CRV",   name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0xd533a949740bb3306d119cc777fa900ba034cd52", confs: 12, minDep: "5", minWith: "20", fee: "2", explorer: "https://etherscan.io/tx/{txid}" },
  // SNX
  { coin: "SNX",   name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0xc011a73ee8576fb46f5e1c5751ca3b9fe0af2a6f", confs: 12, minDep: "1", minWith: "5", fee: "0.5", explorer: "https://etherscan.io/tx/{txid}" },
  { coin: "SNX",   name: "Optimism",          chain: "OPTIMISM", contract: "0x8700daec35af8ff88c16bdf0418774cb3d7599b4", confs: 10, minDep: "1", minWith: "5", fee: "0.2", explorer: "https://optimistic.etherscan.io/tx/{txid}" },
  // 1INCH
  { coin: "1INCH", name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0x111111111117dc0aa78b770fa6a738034120c302", confs: 12, minDep: "5", minWith: "20", fee: "2", explorer: "https://etherscan.io/tx/{txid}" },
  { coin: "1INCH", name: "BNB Chain (BEP-20)",chain: "BNB",      contract: "0x111111111117dc0aa78b770fa6a738034120c302", confs: 15, minDep: "5", minWith: "20", fee: "1", explorer: "https://bscscan.com/tx/{txid}" },
  // SUSHI
  { coin: "SUSHI", name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0x6b3595068778dd592e39a122f4f5a5cf09c90fe2", confs: 12, minDep: "1", minWith: "5", fee: "0.5", explorer: "https://etherscan.io/tx/{txid}" },
  // YFI
  { coin: "YFI",   name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0x0bc529c00c6401aef6d220be8c6ea1667f6ad93e", confs: 12, minDep: "0.001", minWith: "0.005", fee: "0.0005", explorer: "https://etherscan.io/tx/{txid}" },
  // ANKR
  { coin: "ANKR",  name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0x8290333cef9e6d528dd5618fb97a76f268f3edd4", confs: 12, minDep: "10", minWith: "50", fee: "5", explorer: "https://etherscan.io/tx/{txid}" },
  { coin: "ANKR",  name: "BNB Chain (BEP-20)",chain: "BNB",      contract: "0xf307910a4c7bbc79691fd374889b36d8531b08e3", confs: 15, minDep: "10", minWith: "50", fee: "2", explorer: "https://bscscan.com/tx/{txid}" },
  // ENS
  { coin: "ENS",   name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0xc18360217d8f7ab5e7c516566761ea12ce7f9d72", confs: 12, minDep: "0.1", minWith: "0.5", fee: "0.05", explorer: "https://etherscan.io/tx/{txid}" },
  // APE
  { coin: "APE",   name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0x4d224452801aced8b2f0aebe155379bb5d594381", confs: 12, minDep: "1", minWith: "5", fee: "0.5", explorer: "https://etherscan.io/tx/{txid}" },
  // SAND
  { coin: "SAND",  name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0x3845badade8e6dff049820680d1f14bd3903a5d0", confs: 12, minDep: "1", minWith: "5", fee: "0.5", explorer: "https://etherscan.io/tx/{txid}" },
  { coin: "SAND",  name: "Polygon",           chain: "POLYGON",  contract: "0xbbba073c31bf03b8acf7c28ef0738decf3695683", confs: 128,minDep: "1", minWith: "5", fee: "0.2", explorer: "https://polygonscan.com/tx/{txid}" },
  // MANA
  { coin: "MANA",  name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0x0f5d2fb29fb7d3cfee444a200298f468908cc942", confs: 12, minDep: "1", minWith: "5", fee: "0.5", explorer: "https://etherscan.io/tx/{txid}" },
  // CHZ
  { coin: "CHZ",   name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0x3506424f91fd33084466f402d5d97f05f8e3b4af", confs: 12, minDep: "10", minWith: "50", fee: "5", explorer: "https://etherscan.io/tx/{txid}" },
  // EOS
  { coin: "EOS",   name: "EOS",               chain: "EOS",      confs: 1,  minDep: "0.1",     minWith: "1",       fee: "0.05",     explorer: "https://bloks.io/transaction/{txid}" },
  // XTZ
  { coin: "XTZ",   name: "Tezos",             chain: "XTZ",      confs: 5,  minDep: "0.1",     minWith: "1",       fee: "0.01",     explorer: "https://tzstats.com/{txid}" },
  // IOTA
  { coin: "IOTA",  name: "IOTA",              chain: "IOTA",     confs: 1,  minDep: "1",       minWith: "10",      fee: "0",        explorer: "https://thetangle.org/transaction/{txid}" },
  // ZIL
  { coin: "ZIL",   name: "Zilliqa",           chain: "ZIL",      confs: 10, minDep: "10",      minWith: "100",     fee: "5",        explorer: "https://viewblock.io/zilliqa/tx/{txid}" },
  // ONE
  { coin: "ONE",   name: "Harmony",           chain: "ONE",      confs: 12, minDep: "10",      minWith: "100",     fee: "1",        explorer: "https://explorer.harmony.one/tx/{txid}" },
  // KAVA
  { coin: "KAVA",  name: "Kava",              chain: "KAVA",     confs: 5,  minDep: "0.1",     minWith: "1",       fee: "0.05",     explorer: "https://explorer.kava.io/txs/{txid}" },
  // OCEAN
  { coin: "OCEAN", name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0x967da4048cd07ab37855c090aaf366e4ce1b9f48", confs: 12, minDep: "5", minWith: "20", fee: "2", explorer: "https://etherscan.io/tx/{txid}" },
  // STORJ
  { coin: "STORJ", name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0xb64ef51c888972c908cfacf59b47c1afbc0ab8ac", confs: 12, minDep: "5", minWith: "20", fee: "2", explorer: "https://etherscan.io/tx/{txid}" },
  // BAL
  { coin: "BAL",   name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0xba100000625a3754423978a60c9317c58a424e3d", confs: 12, minDep: "0.1", minWith: "0.5", fee: "0.05", explorer: "https://etherscan.io/tx/{txid}" },
  // UMA
  { coin: "UMA",   name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0x04fa0d235c4abf4bcf4787af4cf447de572ef828", confs: 12, minDep: "0.5", minWith: "2", fee: "0.2", explorer: "https://etherscan.io/tx/{txid}" },
  // BAND
  { coin: "BAND",  name: "BandChain",         chain: "BAND",     confs: 1,  minDep: "0.1",     minWith: "1",       fee: "0.1",      explorer: "https://cosmoscan.io/tx/{txid}" },
  { coin: "BAND",  name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0xba11d00c5f74255f56a5e366f4f77f5a186d7f55", confs: 12, minDep: "0.1", minWith: "1", fee: "0.1", explorer: "https://etherscan.io/tx/{txid}" },
  // KNC
  { coin: "KNC",   name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0xdefa4e8a7bcba345f687a2f1456f5edd9ce97202", confs: 12, minDep: "1", minWith: "5", fee: "0.5", explorer: "https://etherscan.io/tx/{txid}" },
  // NMR
  { coin: "NMR",   name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0x1776e1f26f98b1a5df9cd347953a26dd3cb46671", confs: 12, minDep: "0.01", minWith: "0.05", fee: "0.005", explorer: "https://etherscan.io/tx/{txid}" },
  // REN
  { coin: "REN",   name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0x408e41876cccdc0f92210600ef50372656052a38", confs: 12, minDep: "5", minWith: "20", fee: "2", explorer: "https://etherscan.io/tx/{txid}" },
  // AUDIO
  { coin: "AUDIO", name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0x18aaa7115705e8be94bffebde57af9bfc265b998", confs: 12, minDep: "5", minWith: "20", fee: "2", explorer: "https://etherscan.io/tx/{txid}" },
  { coin: "AUDIO", name: "Solana (SPL)",      chain: "SOL",      contract: "9LzCMqDgTKYz9Drzqnpgee3SGa89up3a247ypMj2xrqM", confs: 1, minDep: "5", minWith: "20", fee: "0.5", explorer: "https://solscan.io/tx/{txid}" },
  // SKL
  { coin: "SKL",   name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0x00c83aecc790e8a4453e5dd3b0b4b3680501a7a7", confs: 12, minDep: "50", minWith: "200", fee: "20", explorer: "https://etherscan.io/tx/{txid}" },
  // CELR
  { coin: "CELR",  name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0x4f9254c83eb525f9fcf346490bbb3ed28a81c667", confs: 12, minDep: "10", minWith: "50", fee: "5", explorer: "https://etherscan.io/tx/{txid}" },
  // CTSI
  { coin: "CTSI",  name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0x491604c0fdf08347dd1fa4ee062a822a5dd06b5d", confs: 12, minDep: "5", minWith: "20", fee: "2", explorer: "https://etherscan.io/tx/{txid}" },
  // COTI
  { coin: "COTI",  name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0xddb3422497e61e13543bea06989c0789117555c5", confs: 12, minDep: "5", minWith: "20", fee: "2", explorer: "https://etherscan.io/tx/{txid}" },
  // DENT
  { coin: "DENT",  name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0x3597bfd533a99c9aa083587b074434e61eb0a258", confs: 12, minDep: "1000", minWith: "5000", fee: "500", explorer: "https://etherscan.io/tx/{txid}" },
  // HOT
  { coin: "HOT",   name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0x6c6ee5e31d828de241282b9606c8e98ea48526e2", confs: 12, minDep: "100", minWith: "500", fee: "50", explorer: "https://etherscan.io/tx/{txid}" },
  // WIN
  { coin: "WIN",   name: "TRON (TRC-10)",     chain: "TRX",      confs: 20, minDep: "100",     minWith: "1000",    fee: "10",       explorer: "https://tronscan.org/#/transaction/{txid}" },
  // FET
  { coin: "FET",   name: "BNB Chain (BEP-20)",chain: "BNB",      contract: "0x031b41e504677879370e9dbcf937283a8691fa7", confs: 15, minDep: "5", minWith: "20", fee: "1", explorer: "https://bscscan.com/tx/{txid}" },
  // PERP
  { coin: "PERP",  name: "Optimism",          chain: "OPTIMISM", contract: "0x9e1028f5f1d5ede59748ffcee5532509976840e0", confs: 10, minDep: "1", minWith: "5", fee: "0.2", explorer: "https://optimistic.etherscan.io/tx/{txid}" },
  // GALA
  { coin: "GALA",  name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0xd1d2eb1b1e90b638588728b4130137d262c87cae", confs: 12, minDep: "5", minWith: "20", fee: "2", explorer: "https://etherscan.io/tx/{txid}" },
  { coin: "GALA",  name: "BNB Chain (BEP-20)",chain: "BNB",      contract: "0x7ddee176f665cd201f93eede625770e2fd911990", confs: 15, minDep: "5", minWith: "20", fee: "1", explorer: "https://bscscan.com/tx/{txid}" },
  // LSK
  { coin: "LSK",   name: "Lisk",              chain: "LSK",      confs: 10, minDep: "0.1",     minWith: "1",       fee: "0.1",      explorer: "https://lisk.observer/transactions/{txid}" },
  // MTL
  { coin: "MTL",   name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0xf433089366899d83a9f26a773d59ec7ecf30355e", confs: 12, minDep: "1", minWith: "5", fee: "0.5", explorer: "https://etherscan.io/tx/{txid}" },
  // SXP
  { coin: "SXP",   name: "BNB Chain (BEP-20)",chain: "BNB",      contract: "0x47bead2563dcbf3bf2c9407fea4dc236faba485a", confs: 15, minDep: "1", minWith: "5", fee: "0.5", explorer: "https://bscscan.com/tx/{txid}" },
  // FLUX
  { coin: "FLUX",  name: "Flux",              chain: "FLUX",     confs: 10, minDep: "0.1",     minWith: "1",       fee: "0.05",     explorer: "https://explorer.runonflux.io/tx/{txid}" },
  // PHA
  { coin: "PHA",   name: "Ethereum (ERC-20)", chain: "ETH",      contract: "0x6c5ba91642f10282b576d91922ae6448c9d52f4", confs: 12, minDep: "5", minWith: "20", fee: "2", explorer: "https://etherscan.io/tx/{txid}" },
];

async function seedNetworks() {
  console.log("\n🌐 Seeding coin networks...");

  const allCoins = await db.select({ id: coinsTable.id, symbol: coinsTable.symbol }).from(coinsTable);
  const bySymbol = Object.fromEntries(allCoins.map(c => [c.symbol, c.id]));

  const rows: typeof networksTable.$inferInsert[] = [];
  for (const n of NETWORKS) {
    const coinId = bySymbol[n.coin];
    if (!coinId) continue;
    rows.push({
      coinId,
      name:             n.name,
      chain:            n.chain,
      contractAddress:  n.contract ?? null,
      minDeposit:       n.minDep ?? "0",
      minWithdraw:      n.minWith ?? "0",
      withdrawFee:      n.fee ?? "0",
      withdrawFeePercent: "0",
      withdrawFeeMin:   "0",
      confirmations:    n.confs ?? 12,
      depositEnabled:   true,
      withdrawEnabled:  true,
      memoRequired:     ["XRP","XLM","ATOM","HBAR","IOTA"].includes(n.chain),
      status:           "active",
      providerType:     "custom",
      explorerUrl:      n.explorer ?? null,
      nodeStatus:       "unknown",
      autoSweepEnabled: false,
    });
  }

  // Upsert by (coin_id, chain) — skip duplicates
  for (const row of rows) {
    await db
      .insert(networksTable)
      .values(row)
      .onConflictDoNothing();
  }

  console.log(`   ✅ ${rows.length} networks seeded across ${new Set(NETWORKS.map(n => n.coin)).size} coins.`);
}

async function main() {
  console.log("🚀 Starting seed...");
  try {
    await seedCoins();
    await seedNetworks();
    await seedPairs();
    console.log("\n✅ Seed complete!\n");
  } finally {
    await db.$client.end?.();
    process.exit(0);
  }
}

main().catch(err => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
