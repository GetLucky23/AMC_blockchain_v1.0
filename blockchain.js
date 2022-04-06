'use strict';

var CryptoJS = require("crypto-js");  
var express = require("express");  
var bodyParser = require('body-parser');  
var WebSocket = require("ws");  
  
var http_port = process.env.HTTP_PORT || 3001;  
var p2p_port = process.env.P2P_PORT || 6001;  
var initialPeers = process.env.PEERS ? process.env.PEERS.split(',') : [];  
  
class Block {  
    constructor(index, previousHash, timestamp, data, hash) {  
        this.index = index;  
        this.previousHash = previousHash.toString();  
        this.timestamp = timestamp;  
        this.data = data;  
        this.hash = hash.toString();  
    }  
}  
  
var getGenesisBlock = () => {  
    return new Block(0, "0", 1465154705, "my genesis block!!", "816534932c2b7154836da6afc367695e6337db8a921823784c14378abed4f7d7");  
};  
  
var blockchain = [getGenesisBlock()];  
  
var generateNextBlock = (blockData) => {  
    var previousBlock = getLatestBlock();  
    var nextIndex = previousBlock.index + 1;  
    var nextTimestamp = new Date().getTime() / 1000;  
    var nextHash = calculateHash(nextIndex, previousBlock.hash, nextTimestamp, blockData);  
    return new Block(nextIndex, previousBlock.hash, nextTimestamp, blockData, nextHash);  
};
  
var calculateHashForBlock = (block) => {  
    return calculateHash(block.index, block.previousHash, block.timestamp, block.data);  
};  
  
var calculateHash = (index, previousHash, timestamp, data) => {  
    return CryptoJS.SHA256(index + previousHash + timestamp + data).toString();  
};  
  
var addBlock = (newBlock) => {  
    if (isValidNewBlock(newBlock, getLatestBlock())) {  
        blockchain.push(newBlock);  
    }  
};  
  
var isValidNewBlock = (newBlock, previousBlock) => {  
    if (previousBlock.index + 1 !== newBlock.index) {  
        console.log('invalid index');  
        return false;  
    } else if (previousBlock.hash !== newBlock.previousHash) {  
        console.log('invalid previoushash');  
        return false;  
    } else if (calculateHashForBlock(newBlock) !== newBlock.hash) {  
        console.log(typeof (newBlock.hash) + ' ' + typeof calculateHashForBlock(newBlock));  
        console.log('invalid hash: ' + calculateHashForBlock(newBlock) + ' ' + newBlock.hash);  
        return false;  
    }  
    return true;  
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
  
var replaceChain = (newBlocks) => {  
    if (isValidChain(newBlocks) && newBlocks.length > blockchain.length) {  
        console.log('Received blockchain is valid. Replacing current blockchain with received blockchain');  
        blockchain = newBlocks;  
        broadcast(responseLatestMsg());  
    } else {  
        console.log('Received blockchain invalid');  
    }  
};  
  
var isValidChain = (blockchainToValidate) => {  
    if (JSON.stringify(blockchainToValidate[0]) !== JSON.stringify(getGenesisBlock())) {  
        return false;  
    }  
    var tempBlocks = [blockchainToValidate[0]];  
    for (var i = 1; i < blockchainToValidate.length; i++) {  
        if (isValidNewBlock(blockchainToValidate[i], tempBlocks[i - 1])) {  
            tempBlocks.push(blockchainToValidate[i]);  
        } else {  
            return false;  
        }  
    }  
    return true;  
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
