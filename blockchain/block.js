const ChainUtil = require('../chain-util');
const Transaction = require('../wallet/transaction');
const TransactionPool = require('../wallet/transactionPool');
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
    const usersTransactions = [];

    if (!Array.isArray(block.data)) {
      console.log('Block Data should be an Array');
      return false;
    }

    for (let i = 0; i < block.data.length; i++) {
      const transaction = block.data[i];

      if (transaction.input.signature) {
        const isValid = Transaction.validate(transaction);
        if (!isValid) return false;

        usersTransactions.push(transaction);
      } else {
        rewardTransaction = transaction;
      }
    }

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
      console.log('-'.repeat(30));
      console.log('Wrong reward transaction. Block is corrupted!');
      console.log('block');
      console.log(block);
      console.log('rewardTransaction');
      console.log(rewardTransaction);
      console.log('-'.repeat(30));
      return false;
    }

    const validTransactions = TransactionPool
      .validateTransactionSequence(usersTransactions, chain.slice(0, blockIndex));
    if (validTransactions.length !== usersTransactions.length) {
      console.log('Invalid block transactions sequence!');
      return false;
    }

    return true;
  }
}

module.exports = Block;
