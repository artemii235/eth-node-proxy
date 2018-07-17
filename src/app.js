const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const rp = require('request-promise-native');
const txDecoder = require('ethereum-tx-decoder');
const BN = require('bn.js');
const morgan = require('morgan');
const fs = require('fs');
const winston = require('winston');

morgan.token('body', function getId (req) {
  return JSON.stringify(req.body);
});

const accessLogStream = fs.createWriteStream('/usr/log/access.log', { flags: 'a' });

// 1 gwei by default
let gasPrice = new BN('1000000000');

app.use(bodyParser.json());
app.use(morgan(':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :body', {stream: accessLogStream}));

const myFormat = winston.format.printf(info => {
  return `${info.timestamp} ${info.message}`;
});

const logger = winston.createLogger({
  level: 'error',
  format: winston.format.combine(
    winston.format.timestamp(),
    myFormat
  ),
  transports: [
    new winston.transports.Console()
  ]
});

app.post('/', async function (req, res) {
  try {
    if (req.body.method === 'eth_sendRawTransaction') {
      const decodedTx = txDecoder.decodeTx(req.body.params[0]);
      if (decodedTx.gasPrice.lt(gasPrice)) {
        logger.error(`Rejecting transaction with too low gas price ${ req.body.params[0] }`);
        res.status(500).json({ error: `Can't send transaction with too low gas price!` });
        return;
      }
    } else if (typeof req.body[Symbol.iterator] === 'function') {
      for (let request of req.body) {
        if (request.method === 'eth_sendRawTransaction') {
          const decodedTx = txDecoder.decodeTx(request.params[0]);
          if (decodedTx.gasPrice.lt(gasPrice)) {
            logger.error(`Rejecting transaction with too low gas price ${ request.params[0] }`);
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
    logger.error(e);
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
  logger.error(err);
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
    let newGasPrice = new BN(response.safeLow).mul(new BN('100000000'));
    if (newGasPrice.eq(0)) {
      newGasPrice = new BN('1000000000');
    }
    gasPrice = newGasPrice;
  } catch (e) {
    logger.error(`Error while updating gas price`);
    logger.error(e);
  }
}, 10000);
