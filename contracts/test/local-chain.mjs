import hre from 'hardhat';
import {createProvider} from 'hardhat/internal/core/providers/construction.js';
// In-process, unlocked ephemeral test accounts only. Never connect to a public
// network or export/store their private keys or a mnemonic.
export async function localChain(chainId=84532){
  const config={...hre.config,networks:{...hre.config.networks,hardhat:{...hre.config.networks.hardhat,chainId}}};
  const provider=await createProvider(config,'hardhat');
  return {provider,async close(){provider.removeAllListeners();}};
}
