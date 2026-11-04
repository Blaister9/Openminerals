// MetaMask's RN bundle imports `ws` as a Node fallback. React Native already
// provides the WebSocket implementation; never pull Node net/crypto into Metro.
module.exports=globalThis.WebSocket;
module.exports.WebSocket=globalThis.WebSocket;
