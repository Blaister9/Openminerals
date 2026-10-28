// Presentation only: the API remains authoritative for balances and receipts.
export type PortfolioInput = {
  walletMinor:{USDT:number};
  holdingsMg:Record<string,number>;
  priceCentsPerGram:Record<string,number>;
};
export type PortfolioSummary = {
  metalsValueMinor:number;
  usdtAvailableMinor:number;
  totalUsdtAndMetalsMinor:number;
};
export type BuyQuote = {
  grams:number;
  milligrams:number;
  normalizedGrams:string;
  baseMinor:number;
  feeMinor:number;
  totalMinor:number;
};

/** Accept a decimal comma, never infer a thousands separator or omitted decimal. */
export function normalizeDecimalInput(input:string):string {
  const trimmed=input.trim();
  if(trimmed.includes('.')||trimmed.split(',').length!==2)return trimmed;
  return trimmed.replace(',','.');
}

function scaledDecimal(input:string,fractionDigits:2|3):{normalized:string;scaled:number}|null {
  const normalized=normalizeDecimalInput(input);
  if(!new RegExp(`^\\d{1,10}(?:\\.\\d{1,${fractionDigits}})?$`).test(normalized))return null;
  const [whole,fraction='']=normalized.split('.');
  const scaled=Number(whole)*(10**fractionDigits)+Number(fraction.padEnd(fractionDigits,'0'));
  // Same quantity limits as the demo API; no scientific notation or rounding inputs.
  const maximum=fractionDigits===2?10_000_000_000:1_000_000_000;
  if(!Number.isSafeInteger(scaled)||scaled<=0||scaled>maximum)return null;
  return {normalized,scaled};
}

/** Returns positive units for display, or null while an input is incomplete/invalid. */
export function parsePositiveDecimal(input:string,fractionDigits:2|3):number|null {
  const parsed=scaledDecimal(input,fractionDigits);
  return parsed?parsed.scaled/(10**fractionDigits):null;
}

const ceilDiv=(value:bigint,divisor:bigint)=>(value+divisor-1n)/divisor;

/** Value of metals and available USDT are separate figures; other currencies are excluded. */
export function summarizePortfolio(state:PortfolioInput):PortfolioSummary {
  const metalsValueMinor=Object.entries(state.holdingsMg).reduce((total,[metal,mg])=>
    total+Number(ceilDiv(BigInt(mg)*BigInt(state.priceCentsPerGram[metal]),1000n)),0);
  const usdtAvailableMinor=state.walletMinor.USDT;
  return {metalsValueMinor,usdtAvailableMinor,totalUsdtAndMetalsMinor:usdtAvailableMinor+metalsValueMinor};
}

/** Quote the same two rounding steps as the API: base first, then commission. */
export function quoteBuy(grams:string,priceCentsPerGram:number,buyBps=100):BuyQuote|null {
  const parsed=scaledDecimal(grams,3);
  if(!parsed||parsed.scaled<100||!Number.isSafeInteger(priceCentsPerGram)||priceCentsPerGram<=0||
    !Number.isSafeInteger(buyBps)||buyBps<0||buyBps>10_000)return null;
  const base=ceilDiv(BigInt(parsed.scaled)*BigInt(priceCentsPerGram),1000n);
  const fee=ceilDiv(base*BigInt(buyBps),10_000n);
  const total=base+fee;
  if(total>BigInt(Number.MAX_SAFE_INTEGER))return null;
  return {
    grams:parsed.scaled/1000,milligrams:parsed.scaled,normalizedGrams:parsed.normalized,
    baseMinor:Number(base),feeMinor:Number(fee),totalMinor:Number(total),
  };
}
