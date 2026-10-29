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
export type SellQuote = Omit<BuyQuote,'totalMinor'> & {outputMinor:number};
export type ConversionQuote = {
  from:string;
  to:string;
  normalizedAmount:string;
  amountMinor:number;
  outputMinor:number;
  rateDemo:number;
  feeMinor:0;
};
export type DemoRates = Partial<Record<string,Partial<Record<string,number>>>>;

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

/** Preview only: the server checks the available position and resulting wallet. */
export function quoteSell(grams:string,priceCentsPerGram:number,sellBps=120):SellQuote|null {
  const quote=quoteBuy(grams,priceCentsPerGram,sellBps);
  if(!quote)return null;
  const outputMinor=quote.baseMinor-quote.feeMinor;
  if(outputMinor<=0||outputMinor>10_000_000_000)return null;
  return {
    grams:quote.grams,milligrams:quote.milligrams,normalizedGrams:quote.normalizedGrams,
    baseMinor:quote.baseMinor,feeMinor:quote.feeMinor,outputMinor,
  };
}

/** Demo rates are scaled by 1,000,000; round down exactly as the API does. */
export function quoteConversion(amount:string,from:string,to:string,rates:DemoRates):ConversionQuote|null {
  const currencies=['COP','EUR','USD','USDT'];
  const parsed=scaledDecimal(amount,2);
  if(!parsed||from===to||!currencies.includes(from)||!currencies.includes(to))return null;
  const rateDemo=rates[from]?.[to];
  if(typeof rateDemo!=='number'||!Number.isSafeInteger(rateDemo)||rateDemo<=0)return null;
  const output=BigInt(parsed.scaled)*BigInt(rateDemo)/1_000_000n;
  if(output<=0n||output>10_000_000_000n)return null;
  return {from,to,normalizedAmount:parsed.normalized,amountMinor:parsed.scaled,
    outputMinor:Number(output),rateDemo,feeMinor:0};
}
