const { EventEmitter } = require('events');
const cloneDeep = require('lodash/cloneDeep');
const Wallet = require('./index');
const Transaction = require('./transaction');
const { MINER_WALLET } = require('../config');
const ChainUtil = require('../chain-util');

class TransactionPool extends EventEmitter {
  constructor() {
    super();
    this.transactions = [];
  }

  replaceOrAddTransaction(transaction) {
    const sameTransactionIdx = this.transactions.findIndex(t => t.id === transaction.id);

    if (~sameTransactionIdx) {
      this.transactions[sameTransactionIdx] = transaction;
    } else {
      this.transactions.push(transaction);
    }
  }

  getTransactionFromAddress(address) {
    return this.transactions.find(t => t.input.address === address);
  }

  validTransactions() {
    return this.transactions.filter(transaction => {
      const outputTotal = transaction.outputs.reduce(
        (total, output) => total + parseInt(output.amount, 10),
        0,
      );
      if (transaction.input.amount !== outputTotal) {
        console.log(`Invalid transaction from ${transaction.input.address}`);
        return false;
      }

      if (!Transaction.verifyTransaction(transaction)) {
        console.log(`Invalid signature from ${transaction.input.address}`);
        return false;
      }

      return true;
    });
  }

  sortAndFilter(feeThreshold = 0) {
    const selectedTransactions = this.transactions
      .filter(transaction => {
        return transaction.outputs
          .find(output => output.address === MINER_WALLET)
          .amount >= feeThreshold;
      })
      .sort((a, b) => {
        let aFee = 0;
        let bFee = 0;

        a.outputs.forEach(output => {
          if (output.address === MINER_WALLET) {
            aFee = output.amount;
          }
        });
        b.outputs.forEach(output => {
          if (output.address === MINER_WALLET) {
            bFee = output.amount;
          }
        });

        return aFee - bFee;
      });

    this.transactions = cloneDeep(selectedTransactions);
    const suitableTransactions = [];

    while (
      ChainUtil.sizeOfObjectInMb(suitableTransactions) < 1
      && selectedTransactions.length > 0
    ) {
      suitableTransactions.push(selectedTransactions.pop());
    }

    return suitableTransactions;
  }

  pickTransactions(feeThreshold) {
    this.transactions = this.validTransactions();

    return this.sortAndFilter(feeThreshold);
  }

  clean(chain) {
    if (!this.transactions.length || !chain.length) return;

    const userBalanceMap = {};
    const deleteIndexes = [];

    this.transactions = this.transactions.sort((a, b) => a.input.timestamp - b.input.timestamp);
    this.transactions.forEach((trans, index) => {
      const userPubKey = trans.input.address;

      if (!userBalanceMap[userPubKey]) {
        userBalanceMap[userPubKey] = Wallet.calculateBalance(chain, userPubKey);
      }

      const transAmount = trans.outputs.reduce((acc, output) => {
        if (output.address === userPubKey) return acc;
        return acc + parseInt(output.amount, 10);
      }, 0);

      if (userBalanceMap[userPubKey] >= transAmount) {
        userBalanceMap[userPubKey] -= transAmount;
        return;
      }
      deleteIndexes.push(index);
    });

    [...new Set(deleteIndexes)].forEach(index => {
      console.log('-'.repeat(30));
      console.log('INVALID TRANSACTIONS REMOVED:');
      console.log(this.transactions.splice(index, 1));
      console.log('-'.repeat(30));
    });

    this.removeDuplicates(chain);
  }

  removeDuplicates(chain) {
    if (!this.transactions.length || !chain.length) return false;

    const transactionsMap = {};

    chain.forEach(block => {
      if (!block.data) return;
      block.data.forEach(transaction => {
        transactionsMap[transaction.id] = true;
      });
    });

    const deleteIndexes = [];
    this.transactions.forEach((transaction, index) => {
      if (!transactionsMap[transaction.id]) {
        transactionsMap[transaction.id] = true;
        return;
      }

      deleteIndexes.push(index);
    });

    deleteIndexes.forEach(index => {
      console.log('-'.repeat(30));
      console.log('INVALID TRANSACTIONS REMOVED:');
      console.log(this.transactions.splice(index, 1));
      console.log('-'.repeat(30));
    });

    // this.emit('clear');
    return deleteIndexes?.length !== 0;
  }
}

module.exports = TransactionPool;
