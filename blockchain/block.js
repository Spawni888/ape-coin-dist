const ChainUtil = require('../chain-util');
const Transaction = require('../wallet/transaction');
const { DIFFICULTY, MINE_RATE } = require('../config');

class Block {
  constructor(timestamp, lastHash, hash, data, nonce, difficulty) {
    this.timestamp = timestamp;
    this.lastHash = lastHash;
    this.hash = hash;
    this.data = data;
    this.nonce = nonce;
    this.difficulty = difficulty || DIFFICULTY;
  }

  toString() {
    return `Block —
      Timestamp : ${this.timestamp}
      Last Hash : ${this.lastHash.substring(0, 10)}
      Hash      : ${this.hash.substring(0, 10)}
      Nonce     : ${this.nonce}
      Difficulty: ${this.difficulty}
      Data      : ${this.data}`;
  }

  static genesis() {
    return new this(Date.now(), '------', 'GENESIS', [], 0, DIFFICULTY);
  }

  static randomIntFromInterval(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
  }

  static rollNonce(lastBlock, data, eventEmitter, hashCounter, nonceCache = {}, nonce = 0) {
    const lastHash = lastBlock.hash;
    let hash = '';
    let { difficulty } = lastBlock;
    let timestamp = 0;
    nonce = this.randomIntFromInterval(0, Number.MAX_SAFE_INTEGER);
    hashCounter.count++;

    if (!nonceCache[nonce]) {
      timestamp = Date.now();
      difficulty = Block.adjustDifficulty(lastBlock, timestamp);
      hash = this.createHash(timestamp, lastHash, data, nonce, difficulty);
    }
    // cache nonce values
    nonceCache[nonce] = true;

    if (hash.substring(0, difficulty) === '0'.repeat(difficulty)) {
      const newBlock = new this(timestamp, lastHash, hash, data, nonce, difficulty);
      eventEmitter.emit('block-mined', newBlock);
      return;
    }
    setImmediate(
      () => Block.rollNonce(lastBlock, data, eventEmitter, hashCounter, nonceCache, nonce),
    );
  }

  static createHash(timestamp, lastHash, data, nonce, difficulty) {
    return ChainUtil
      .createHash(`${timestamp}${lastHash}${data}${nonce}${difficulty}`);
  }

  static blockHash(block) {
    const {
      timestamp, lastHash, data, nonce, difficulty,
    } = block;
    return this.createHash(timestamp, lastHash, data, nonce, difficulty);
  }

  static adjustDifficulty(lastBlock, currentTime) {
    let { difficulty } = lastBlock;

    difficulty = lastBlock.timestamp + MINE_RATE > currentTime
      ? difficulty + 1
      : difficulty - 1;

    return Math.max(difficulty, 1);
  }

  static validBlock(block, blockIndex, chain = []) {
    let rewardTransaction;

    if (!Array.isArray(block.data)) {
      console.log('Block Data should be an Array');
      return false;
    }

    const usersTransactions = block.data.filter(transaction => {
      if (transaction.input.signature) {
        return Transaction.verifyTransaction(transaction);
      }
      rewardTransaction = transaction;
      return false;
    });

    if (usersTransactions.length + 1 !== block.data.length) {
      console.log('There are should be only one Reward Transaction!');
      return false;
    }
    if (
      !rewardTransaction
      || !Transaction.verifyRewardTransaction(
        rewardTransaction,
        usersTransactions,
        chain.slice(0, blockIndex),
      )
    ) {
      console.log('Wrong reward transaction. Block is corrupted!');
      console.log(block);
      return false;
    }
    return true;
  }
}

module.exports = Block;
