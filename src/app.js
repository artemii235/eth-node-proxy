const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const rp = require('request-promise-native');
const txDecoder = require('ethereum-tx-decoder');
const BN = require('bn.js');

// 1 gwei by default
let gasPrice = new BN('1000000000');

app.use(bodyParser.json());

app.post('/', async function (req, res) {
  try {
    if (req.body.method === 'eth_sendRawTransaction') {
      const decodedTx = txDecoder.decodeTx(req.body.params[0]);
      if (decodedTx.gasPrice.lt(gasPrice)) {
        console.log(`Rejecting transaction with too low gas price ${ req.body.params[0] }`);
        res.status(500).json({ error: `Can't send transaction with too low gas price!` });
        return;
      }
    } else if (typeof req.body[Symbol.iterator] === 'function') {
      for (let request of req.body) {
        if (request.method === 'eth_sendRawTransaction') {
          const decodedTx = txDecoder.decodeTx(request.params[0]);
          if (decodedTx.gasPrice.lt(gasPrice)) {
            console.log(`Rejecting transaction with too low gas price ${ request.params[0] }`);
            res.status(500).json({error: `Can't send transaction with too low gas price!`});
            return;
          }
        }
      }
    }

    const options = {
      method: 'POST',
      uri: process.env.ETH_NODE_URL,
      body: req.body,
      json: true
    };

    const response = await rp(options);
    res.status(200).json(response);
  } catch (e) {
    console.log(e);
    res.status(500).json({ error: 'Error occurred' });
  }
});

app.listen(process.env.PORT, function() {
  console.log(`ETH node proxy listening on port ${ process.env.PORT }!`);
});

app.use(function(req, res, next) {
  res.status(404).json({error: 'Route is not found!'});
});

app.use(function(err, req, res, next) {
  console.log(err);
  res.status(500).json({error: 'Error occurred'});
});

// update gas price every minute
setInterval(async function () {
  try {
    const options = {
      method: 'GET',
      uri: "https://ethgasstation.info/json/ethgasAPI.json",
      json: true
    };

    const response = await rp(options);
    gasPrice = new BN(response.safeLow).mul(new BN('100000000'));
  } catch (e) {
    console.log(`Error while updating gas price`);
    console.log(e);
  }
}, 10000);
