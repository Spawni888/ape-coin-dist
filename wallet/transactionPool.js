const { EventEmitter } = require('events');
const cloneDeep = require('lodash/cloneDeep');
const Wallet = require('./index');
const Transaction = require('./transaction');
const { MINER_WALLET, BLOCKCHAIN_WALLET } = require('../config');
const ChainUtil = require('../chain-util');

class TransactionPool extends EventEmitter {
  constructor() {
    super();
    this.transactions = [];
  }

  static validateTransactionSequence(transactions, chain) {
    transactions = transactions.sort((a, b) => a.input.timestamp - b.input.timestamp);

    const userBalanceMap = {};
    const deleteIndexes = [];
    const validTransactions = cloneDeep(transactions);

    validTransactions.forEach((trans, index) => {
      if (trans.input.address === BLOCKCHAIN_WALLET) return;
      const userPubKey = trans.input.address;

      if (!userBalanceMap[userPubKey]) {
        userBalanceMap[userPubKey] = Wallet.calculateBalance(chain, userPubKey);
      }

      let userOutput = null;
      const transAmount = trans.outputs.reduce((acc, output) => {
        if (output.address === userPubKey) {
          userOutput = output;
          return acc;
        }
        return acc + parseFloat(output.amount);
      }, 0);

      if (userBalanceMap[userPubKey] >= transAmount) {
        userBalanceMap[userPubKey] -= transAmount;

        if (userOutput && userOutput.amount === userBalanceMap[userPubKey]) {
          return;
        }
        console.log('Wrong user output amount!');
      }
      deleteIndexes.push(index);
    });

    [...new Set(deleteIndexes)].forEach(index => {
      console.log('-'.repeat(30));
      console.log('INVALID TRANSACTIONS REMOVED:');
      console.log(validTransactions.splice(index, 1));
      console.log('-'.repeat(30));
    });
    return validTransactions;
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

  getValidTransactions() {
    return this.transactions.filter(Transaction.validate);
  }

  sortAndFilter(feeThreshold = 0) {
    const selectedTransactions = this.transactions
      .filter(transaction => {
        return transaction.outputs
          .find(output => output.address === MINER_WALLET)
          ?.amount >= feeThreshold;
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
    return this.sortAndFilter(feeThreshold);
  }

  clean(chain) {
    if (!this.transactions.length || !chain.length) return;

    this.transactions = this.getValidTransactions();

    this.transactions = TransactionPool.validateTransactionSequence(this.transactions, chain);
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
