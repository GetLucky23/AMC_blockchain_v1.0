'use strict';

console.log('Hello world!');

let CryptoJS = require("crypto-js");
let express = require("express");
let bodyParser = require('body-parser');
let WebSocket = require("ws");

let http_port = process.env.HTTP_PORT || 3001;
let p2p_port = process.env.P2P_PORT || 6001;
let initialPeers = process.env.PEERS ? process.env.PEERS.split(',') : [];

/* Create block construction function that receives index, timestamp, data, hash and previous hash as parameters */
class Block {
  constructor(index, previousHash, timestamp, data, hash) {
      this.index = index;
      this.previousHash = previousHash.toString();
      this.timestamp = timestamp;
      this.data = data;
      this.hash = hash.toString();
  }
}

let sockets = [];
let MessageType = {
    QUERY_LATEST: 0,
    QUERY_ALL: 1,
    RESPONSE_BLOCKCHAIN: 2
};

let getGenesisBlock = () => {
  return new Block(0, "0", 1834040422, "Here lies the name of Creator. And the name is Artem Motalov.", "09233493fc2d7157836da6afc367695e6337db8a927823744c14378abk3d4fhy5");
};

let blockchain = [getGenesisBlock()];

/* The block needs to be hashed to keep the integrity of the data. SHA256 is the most secure one. Hash is randomly generated, however HERE mining should take place.
*/
let calculateHash = (index, previousHash, timestamp, data) => {
  return CryptoJS.SHA256(index + previousHash + timestamp + data).toString();
};

let calculateHashForBlock = (block) => {
  return calculateHash(block.index, block.previousHash, block.timestamp, block.data);
};

// creating new block named Genesis block


// create function that receives data and creates new block
// blockData is something that is provided by the end-user.
let generateNextBlock = (blockData) => {
  let previousBlock = getLatestBlock(); // getLatestBlock() using
  let nextIndex = previousBlock.index + 1;
  let nextTimestamp = new Date().getTime() / 1000; // getTime()
  let nextHash = calculateHash(nextIndex, previousBlock.hash, nextTimestamp, blockData);
  return new Block(nextIndex, previousBlock.hash, nextTimestamp, blockData, nextHash);
};

let addBlock = (newBlock) => {
  if (isValidNewBlock(newBlock, getLatestBlock())) {
      blockchain.push(newBlock);
  }
};

// validating the integrity of blocks, return boolean
let isValidNewBlock = (newBlock, previousBlock) => {
  if (previousBlock.index + 1 !== newBlock.index) {
      console.log('Index is invalid');
      return false;
  } else if (previousBlock.hash !== newBlock.previousHash) {
      console.log('Previous hash is invalid');
      return false;
  } else if (calculateHashForBlock(newBlock) !== newBlock.hash) { // usage of calculateHashForBlock()
      console.log('Invalid hash: ' + calculateHashForBlock(newBlock) + ' ' + newBlock.hash);
      return false;
  }
  return true;
};

// resolving problem - choosing the longest chain
let replaceChain = (newBlocks) => {
  if (isValidChain(newBlocks) && newBlocks.length > blockchain.length) {
      console.log('Received blockchain is valid. Replacing current blockchain with received blockchain');
      blockchain = newBlocks;
      broadcast(responseLatestMsg());
      console.log(`Blockchain: ${blockchain}`);
  } else {
      console.log('Received blockchain is invalid. No replacement executed.');
  }
};

/* NODES */

/* Controlling the node. The user must be able to control the node in some way. This is done by setting up a HTTP server.

The most straightforward way to control the node is e.g. with Curl:

// get all blocks from the node
curl http://localhost:3001/blocks
*/

var initHttpServer = () => {
  var app = express();
  app.use(bodyParser.json());

  app.get('/blocks', (req, res) => res.send(JSON.stringify(blockchain)));
  app.post('/mineBlock', (req, res) => {
      var newBlock = generateNextBlock(req.body.data);
      addBlock(newBlock);
      broadcast(responseLatestMsg());
      console.log('block added: ' + JSON.stringify(newBlock));
      res.send();
  });
  app.get('/peers', (req, res) => {
      res.send(sockets.map(s => s._socket.remoteAddress + ':' + s._socket.remotePort));
  });
  app.post('/addPeer', (req, res) => {
      connectToPeers([req.body.peer]);
      res.send();
  });
  app.listen(http_port, () => console.log('Listening http on port: ' + http_port));
};

// create p2p server to connect to other nodes
var initP2PServer = () => {
  var server = new WebSocket.Server({port: p2p_port});
  server.on('connection', ws => initConnection(ws));
  console.log('listening websocket p2p port on: ' + p2p_port);
};

var initConnection = (ws) => {
  sockets.push(ws);
  initMessageHandler(ws);
  initErrorHandler(ws);
  write(ws, queryChainLengthMsg());
};

var initMessageHandler = (ws) => {
  ws.on('message', (data) => {
      var message = JSON.parse(data);
      console.log('Received message' + JSON.stringify(message));
      switch (message.type) {
          case MessageType.QUERY_LATEST:
              write(ws, responseLatestMsg());
              break;
          case MessageType.QUERY_ALL:
              write(ws, responseChainMsg());
              break;
          case MessageType.RESPONSE_BLOCKCHAIN:
              handleBlockchainResponse(message);
              break;
      }
  });
};

var initErrorHandler = (ws) => {
  var closeConnection = (ws) => {
      console.log('connection failed to peer: ' + ws.url);
      sockets.splice(sockets.indexOf(ws), 1);
  };
  ws.on('close', () => closeConnection(ws));
  ws.on('error', () => closeConnection(ws));
};

var connectToPeers = (newPeers) => {
  newPeers.forEach((peer) => {
      var ws = new WebSocket(peer);
      ws.on('open', () => initConnection(ws));
      ws.on('error', () => {
          console.log('connection failed')
      });
  });
};

var handleBlockchainResponse = (message) => {
  var receivedBlocks = JSON.parse(message.data).sort((b1, b2) => (b1.index - b2.index));
  var latestBlockReceived = receivedBlocks[receivedBlocks.length - 1];
  var latestBlockHeld = getLatestBlock();
  if (latestBlockReceived.index > latestBlockHeld.index) {
      console.log('blockchain possibly behind. We got: ' + latestBlockHeld.index + ' Peer got: ' + latestBlockReceived.index);
      if (latestBlockHeld.hash === latestBlockReceived.previousHash) {
          console.log("We can append the received block to our chain");
          blockchain.push(latestBlockReceived);
          broadcast(responseLatestMsg());
      } else if (receivedBlocks.length === 1) {
          console.log("We have to query the chain from our peer");
          broadcast(queryAllMsg());
      } else {
          console.log("Received blockchain is longer than current blockchain");
          replaceChain(receivedBlocks);
      }
  } else {
      console.log('received blockchain is not longer than received blockchain. Do nothing');
  }
};

var getLatestBlock = () => blockchain[blockchain.length - 1];
var queryChainLengthMsg = () => ({'type': MessageType.QUERY_LATEST});
var queryAllMsg = () => ({'type': MessageType.QUERY_ALL});  
var responseChainMsg = () =>({
    'type': MessageType.RESPONSE_BLOCKCHAIN, 'data': JSON.stringify(blockchain)
});
var responseLatestMsg = () => ({
    'type': MessageType.RESPONSE_BLOCKCHAIN,
    'data': JSON.stringify([getLatestBlock()])
});
var write = (ws, message) => ws.send(JSON.stringify(message));
var broadcast = (message) => sockets.forEach(socket => write(socket, message));

connectToPeers(initialPeers);
initHttpServer();
initP2PServer();
