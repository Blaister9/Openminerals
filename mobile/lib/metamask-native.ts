import {Linking} from 'react-native';
export async function connectMetaMask(){
 await import('./metamask-polyfills');
 const {createEVMClient}=await import('@metamask/connect-evm');
 const client=await createEVMClient({dapp:{name:'Openminerals TESTNET DEMO',url:process.env.EXPO_PUBLIC_API_URL!},api:{supportedNetworks:{'0x14a34':'https://sepolia.base.org'}},analytics:{enabled:false},ui:{headless:true},skipAutoAnnounce:true,
  mobile:{useDeeplink:true,preferredOpenLink:async link=>{const url=new URL(link);if(url.protocol!=='metamask:'&&!(url.protocol==='https:'&&['metamask.app.link','link.metamask.io','connect.metamask.io'].includes(url.hostname)))throw new Error('Enlace externo de MetaMask no permitido.');await Linking.openURL(link);}}});
 try{
 const connected=await client.connect({chainIds:['0x14a34']});const provider=client.getProvider();
 if(connected.chainId!=='0x14a34'){
  try{await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x14a34'}]});}
  catch(error){if((error as {code?:number}).code!==4902)throw error;await provider.request({method:'wallet_addEthereumChain',params:[{chainId:'0x14a34',chainName:'Base Sepolia DEMO',nativeCurrency:{name:'ETH testnet',symbol:'ETH',decimals:18},rpcUrls:['https://sepolia.base.org'],blockExplorerUrls:['https://sepolia.basescan.org']}]});}
 }
 if(await provider.request({method:'eth_chainId'})!=='0x14a34')throw new Error('MetaMask debe estar en Base Sepolia.');
 const accounts=await provider.request({method:'eth_accounts'}) as string[];if(!accounts[0])throw new Error('MetaMask no autorizó una dirección.');
 return {provider,address:accounts[0],disconnect:()=>client.disconnect()};
 }catch(error){await client.disconnect().catch(()=>{});throw error;}
}
