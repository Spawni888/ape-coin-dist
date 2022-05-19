const Block = require('./block');

class Blockchain {
  constructor() {
    this.chain = [Block.genesis()];
    this.checking = false;
    this.check = [];
    this.checkTimer = null;
  }

  static async addBlock(bc, data) {
    return Block.mineBlock(bc, data);
  }

  getLastBlock() {
    if (!this.chain.length) return null;
    return this.chain[this.chain.length - 1];
  }

  isValidChain(chain) {
    if (JSON.stringify(chain[0].hash) !== JSON.stringify(Block.genesis().hash)) {
      console.log('Genesis block hash is wrong!');
      return false;
    }

    for (let i = 1; i < chain.length; i++) {
      const block = chain[i];
      const lastBlock = chain[i - 1];

      if (
        block.lastHash !== lastBlock.hash
        || block.hash !== Block.blockHash(block)
        || !Block.validBlock(block, i, chain)
      ) {
        console.log('Invalid block');
        console.log(block);
        return false;
      }
    }
    return true;
  }

  // replaceChain(newChain, tp) {
  //   if (newChain.length < this.chain.length) {
  //     console.log('Received chain is not longer than the current chain');
  //     return false;
  //   }
  //   if (!this.isValidChain(newChain)) {
  //     console.log('The received chain is not valid');
  //     return false;
  //   }
  //
  //   console.log('Replacing blockchain with the new chain');
  //   this.chain = newChain;
  //
  //   tp.clear(this.chain);
  //
  //   return true;
  // }
}

module.exports = Blockchain;
