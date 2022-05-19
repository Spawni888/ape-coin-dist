const { INITIAL_BALANCE, BLOCKCHAIN_WALLET } = require('../config');
const Transaction = require('./transaction');
const ChainUtil = require('../chain-util');

class Wallet {
  constructor(privKey = null, pubKey = null) {
    this.balance = INITIAL_BALANCE;
    this.keyPair = ChainUtil.genKeyPair(privKey, pubKey);
    this.publicKey = this.keyPair.getPublic().encode('hex');

    // balance calculated with transactions from transaction pool;
    this.balanceWithTpIncluded = this.balance;
  }

  toString() {
    return `Wallet —
      publicKey: ${this.publicKey.toString()}
      balance: ${this.balance}`;
  }

  sign(dataHash) {
    return this.keyPair.sign(dataHash);
  }

  createTransaction(recipient, amount, blockchain, transactionPool, fee = 0) {
    if (recipient === this.publicKey) {
      return {
        transaction: null,
        msg: 'You can\'t transact money to yourself',
      };
    }

    amount = parseFloat(amount);
    fee = parseFloat(fee);
    this.balance = this.calculateBalance(blockchain.chain);

    if (amount + fee > this.balance) {
      return {
        transaction: null,
        msg: `Amount + fee: ${amount + fee} exceeds the current balance: ${this.balance}`,
      };
    }

    let transaction = transactionPool.getTransactionFromAddress(this.publicKey);

    if (transaction) {
      let totalTransactionAmount = 0;

      transaction.outputs.forEach(output => {
        if (output.address === this.publicKey) return;
        totalTransactionAmount += output.amount;
      });

      if (totalTransactionAmount + amount + fee > this.balance) {
        const msg = `Amount + fee: ${
          amount + fee
        } exceeds the current balance: ${this.balance - totalTransactionAmount}`;

        return {
          transaction: null,
          msg,
        };
      }
      transaction.update(this, recipient, amount, fee);
    } else {
      transaction = Transaction.newTransaction(this, recipient, amount, fee);
      transactionPool.replaceOrAddTransaction(transaction);
    }
    // transactionPool.emit('changed', transaction);

    this.calculateBalanceWithTpIncluded(transactionPool);

    return { transaction };
  }

  calculateBalance(chain) {
    return Wallet.calculateBalance(chain, this.publicKey);
  }

  calculateBalanceWithTpIncluded(transactionPool) {
    this.balanceWithTpIncluded = Wallet.calculateBalanceWithTpIncluded(
      transactionPool,
      this.balance,
      this.publicKey,
    );

    return this.balanceWithTpIncluded;
  }

  static calculateBalance(chain, pubKey) {
    let balance = INITIAL_BALANCE;
    const transactions = [];

    chain.forEach(block => block.data.forEach(transaction => {
      transactions.push(transaction);
    }));

    const walletInputTs = transactions
      .filter(transaction => transaction.input.address === pubKey);

    let startTime = 0;

    if (walletInputTs.length > 0) {
      const recentInputT = walletInputTs.reduce(
        (prev, current) => (prev.input.timestamp > current.input.timestamp
          ? prev
          : current),
      );

      balance = recentInputT.outputs.find(output => output.address === pubKey).amount;
      startTime = recentInputT.input.timestamp;
    }

    transactions.forEach(transaction => {
      if (transaction.input.timestamp <= startTime) return;
      if (transaction.input.address === pubKey) return;

      transaction.outputs.find(output => {
        if (output.address !== pubKey) return;
        balance += output.amount;
      });
    });

    return balance;
  }

  static calculateBalanceWithTpIncluded(transactionPool, balance, pubKey) {
    let balanceWithTpIncluded = balance;

    transactionPool.transactions
      .forEach(transaction => {
        if (transaction.input.address === pubKey) {
          transaction.outputs.forEach(output => {
            if (output.address !== pubKey) {
              balanceWithTpIncluded -= output.amount;
            }
          });
          return;
        }
        transaction.outputs.forEach(output => {
          if (output.address === pubKey) {
            balanceWithTpIncluded += output.amount;
          }
        });
      });

    return balanceWithTpIncluded;
  }

  static getNewWalletRelatedTransactions(
    pubKey,
    {
      tp = [],
      oldRelatedTransactions = [],
      bc = [],
      bcStart = 0,
      bcEnd = null,
    },
  ) {
    if (bcEnd === null) {
      bcEnd = bc.length - 1;
    }
    const bcSlice = bc.slice(bcStart, bcEnd + 1);

    const relatedTransactionIDsMap = {};
    const newRelatedTransactions = [];

    oldRelatedTransactions.forEach(transaction => {
      relatedTransactionIDsMap[transaction.id] = transaction;
    });

    const pushIfRelated = (transaction) => {
      if (transaction.input.address === pubKey) {
        newRelatedTransactions.push(transaction);
        transaction.type = 'outcome';
        return true;
      }

      for (const output of transaction.outputs) {
        if (output.address === pubKey) {
          if (!relatedTransactionIDsMap[transaction.id]) {
            newRelatedTransactions.push(transaction);

            if (transaction.input.address === Wallet.getBlockchainAddress()) {
              transaction.type = 'reward';
            } else {
              transaction.type = 'income';
            }
            return true;
          }
          break;
        }
      }
      return false;
    };

    bcSlice.forEach((block, blockIdx) => {
      block.data.forEach(transaction => {
        const isRelated = pushIfRelated(transaction);

        if (!isRelated) return;
        transaction.confirmed = true;
        transaction.blockHash = block.hash;
        transaction.blockTimestamp = block.timestamp;
        transaction.blockIndex = bcStart + blockIdx;
      });
    });
    tp.forEach(pushIfRelated);

    console.log('-'.repeat(10));
    console.log('walletRelatedTransactions');
    console.log(newRelatedTransactions);
    console.log('-'.repeat(10));
    return newRelatedTransactions;
  }

  static blockchainWallet() {
    const blockchainWallet = new this();
    blockchainWallet.address = this.getBlockchainAddress();
    return blockchainWallet;
  }

  static getBlockchainAddress() {
    return BLOCKCHAIN_WALLET;
  }
}

module.exports = Wallet;
