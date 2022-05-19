const ChainUtil = require('../chain-util');
const { MINER_WALLET, BLOCKCHAIN_WALLET } = require('../config');

class Transaction {
  constructor(id = null, input = null, outputs = []) {
    this.id = id || ChainUtil.genId();
    this.input = input || null;
    this.outputs = outputs;
  }

  update(senderWallet, recipient, amount, fee = 0) {
    const senderOutput = this.outputs.find(output => output.address === senderWallet.publicKey);

    senderOutput.amount -= amount + fee;
    this.outputs.push({ amount, address: recipient });
    // this.outputs.find(output => output.address === MINER_WALLET).amount += fee;
    this.outputs.push({ address: MINER_WALLET, amount: fee });

    Transaction.signTransaction(this, senderWallet);

    // eslint-disable-next-line consistent-return
    return this;
  }

  static transactionWithOutputs(senderWallet, outputs) {
    const transaction = new this();

    transaction.outputs.push(...outputs);

    Transaction.signTransaction(transaction, senderWallet);

    return transaction;
  }

  static newTransaction(senderWallet, recipient, amount, fee = 0) {
    if (amount + fee > senderWallet.balance) {
      console.log(`Amount + fee: ${amount + fee} exceeds balance.`);
      return;
    }

    // eslint-disable-next-line consistent-return
    return this.transactionWithOutputs(senderWallet, [
      {
        amount: senderWallet.balance - amount - fee,
        address: senderWallet.publicKey,
      },
      {
        amount,
        address: recipient,
      }, {
        amount: fee,
        address: MINER_WALLET,
      },
    ]);
  }

  static rewardTransaction(minerWallet, pickedTransactions, blockchain) {
    let amount = ChainUtil.miningRewardAmount(blockchain.chain);

    pickedTransactions.forEach(transaction => {
      transaction.outputs.forEach(output => {
        if (output.address === MINER_WALLET) {
          amount += output.amount;
        }
      });
    });

    const transaction = new this();
    transaction.input = {
      timestamp: Date.now(),
      address: BLOCKCHAIN_WALLET,
    };
    transaction.outputs.push(
      {
        address: minerWallet.publicKey,
        amount,
      },
    );
    return transaction;
  }

  static signTransaction(transaction, senderWallet) {
    transaction.input = {
      timestamp: Date.now(),
      amount: senderWallet.balance,
      address: senderWallet.publicKey,
      signature: senderWallet.sign(ChainUtil.createHash(transaction.outputs)),
    };
  }

  static validate(transaction) {
    // TODO: (REMOVE?) IT'S NOT WORKING RIGHT FOR DECIMAL NUMBERS I GUESS...
    let outputTotal = transaction.outputs.reduce(
      (total, output) => total + parseFloat(output.amount),
      0,
    );
    // round down up to 2 decimals
    const transactionInput = Math.floor(transaction.input.amount * 100) / 100;
    outputTotal = Math.floor(outputTotal * 100) / 100;

    if (transactionInput !== outputTotal) {
      console.log(`Invalid transaction from ${transaction.input.address}`);
      console.log('transaction.input.amount !== outputTotal');
      console.log(transaction);
      return false;
    }

    if (!Transaction.verifyTransaction(transaction)) {
      console.log(`Invalid signature from ${transaction.input.address}`);
      return false;
    }

    return true;
  }

  static verifyTransaction(transaction) {
    return ChainUtil.verifySignature(
      transaction.input.address,
      transaction.input.signature,
      ChainUtil.createHash(transaction.outputs),
    );
  }

  static verifyRewardTransaction(rewardTransaction, usersTransactions, chain) {
    let fee = 0;

    usersTransactions.forEach(transaction => {
      transaction.outputs.forEach(output => {
        if (output.address === MINER_WALLET) {
          fee += output.amount;
        }
      });
    });
    return rewardTransaction.outputs[rewardTransaction.outputs.length - 1].amount
      === (ChainUtil.miningRewardAmount(chain) + fee);
  }
}

module.exports = Transaction;
