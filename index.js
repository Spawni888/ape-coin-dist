const path = require('path');
const P2PServer = require('./app/p2p-server');
const Blockchain = require('./blockchain/index');
const TransactionPool = require('./wallet/transactionPool');
const Wallet = require('./wallet');
const express = require('express');

const p2pServer = new P2PServer(new Blockchain(), new TransactionPool());
const PORT = process.env.PORT || 8000;
const app = express();
// app.set('json spaces', 4);

app.use(express.static(path.resolve(__dirname, 'public')));
app.use((req, res, next) => {
  console.log('-'.repeat(60));
  console.log(`Protocol: ${req.protocol}`);
  console.log(`Request from: ${req.headers['x-forwarded-for'] || req.socket.remoteAddress}`);
  console.log(`URL: ${ req.url }`);
  console.log(req.headers['user-agent'] ? req.headers['user-agent'] : 'No user-agent');
  next();
})
app.get('/bc', (req, res) => {
  res.header("Content-Type",'application/json');
  res.send(JSON.stringify(p2pServer.blockchain.chain, null, 2));
})
app.get('/miners', (req, res) => {
  const addresses = Object.keys(p2pServer.miners)
    .map(id => p2pServer.inbounds[id]?.serverAddress || p2pServer.outbounds[id]?.serverAddress);

  res.header("Content-Type",'application/json');
  res.send(JSON.stringify({
    count: addresses.length,
    addresses,
  }, null, 2));
})
app.get('/block/:index', (req, res) => {
  const index = req.params.index;
  if (index === 'index') {
    res.send('Replace `index` in the URL to block index');
    return;
  }

  const result = p2pServer.blockchain.chain[index];
  res.header("Content-Type",'application/json');
  res.send(JSON.stringify(result, null, 2));
})
app.get('/balance/:pubKey', (req, res) => {
  const pubKey = req.params.pubKey;
  if (pubKey === 'pubKey') {
    res.send('Replace `pubKey` in the URL to user pubKey');
    return;
  }

  const result = Wallet.calculateBalance(p2pServer.blockchain.chain, pubKey);
  res.send(String(result));
})
app.get('/transactions/:pubKey', (req, res) => {
  const pubKey = req.params.pubKey;
  if (pubKey === 'pubKey') {
    res.send('Replace `pubKey` in the URL to user pubKey');
    return;
  }

  const result = Wallet.getNewWalletRelatedTransactions(pubKey, {bc: p2pServer.blockchain.chain});
  res.header("Content-Type",'application/json');
  res.send(JSON.stringify(result, null, 2));
})
app.get('/peers', (req, res) => {
  const result = [
    ...Object.values(p2pServer.inbounds)
      .filter(_socket => _socket.available)
      .map(_socket => _socket.serverAddress),
    ...Object.values(p2pServer.outbounds)
      .map(_socket => _socket.serverAddress),
  ]
  res.header("Content-Type",'application/json');
  res.send(JSON.stringify(result, null, 2));
})
app.use((req, res) => res.sendFile(path.resolve(__dirname, 'index.html')));

const server = app.listen(PORT, () => console.log(`Listening on ${PORT}`));

(async () => {
  await p2pServer.listen({ server }, () => {
    console.log(`P2P-server is spinning at ${PORT}!`)
  });
})();
