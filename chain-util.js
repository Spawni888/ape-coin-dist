const { createHash } = require('crypto');
const EC = require('elliptic').ec;
const uuidV1 = require('uuid').v1;
const { FIRST_MINING_REWARD } = require('./config');

const ec = new EC('secp256k1');

class ChainUtil {
  static verifyKeyPair(privateKey, pubKey) {
    const actualPubKey = ec.keyFromPrivate(privateKey, 'hex')
      .getPublic()
      .encode('hex');

    return actualPubKey === pubKey;
  }

  static genKeyPair(privateKey, pubKey) {
    if (privateKey === null && pubKey === null) {
      return ec.genKeyPair();
    }
    if (privateKey) {
      return ec.keyFromPrivate(privateKey, 'hex');
    }
    if (pubKey) {
      return ec.keyFromPublic(pubKey, 'hex');
    }
    return null;
  }

  static genId() {
    return uuidV1();
  }

  static createHash(data) {
    return createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex');
  }

  static verifySignature(publicKey, signature, dataHash) {
    const signatureIsValid = ec.keyFromPublic(publicKey, 'hex').verify(dataHash, signature);
    if (!signatureIsValid) console.log('signature is not valid');

    return signatureIsValid;
  }

  static sizeOfObjectInMb(object) {
    const objectList = [];
    const stack = [object];
    let bytes = 0;

    while (stack.length) {
      const value = stack.pop();

      if (typeof value === 'boolean') {
        bytes += 4;
      } else if (typeof value === 'string') {
        bytes += Buffer.from(value).length;
      } else if (typeof value === 'number') {
        bytes += 8;
      } else if
      (
        typeof value === 'object'
        && objectList.indexOf(value) === -1
      ) {
        objectList.push(value);

        for (const key in value) {
          // eslint-disable-next-line no-prototype-builtins
          if (value.hasOwnProperty(key)) {
            stack.push(value[key]);
          }
        }
      }
    }
    return bytes / (1024 * 1024);
  }

  static miningRewardAmount(chain) {
    const roundFloat = (value) => {
      return Math.floor(value * 100) / 100;
    };
    // eslint-disable-next-line no-restricted-properties
    return roundFloat(FIRST_MINING_REWARD * Math.pow(0.9, Math.floor((chain.length - 1) / 120)));
  }
}

module.exports = ChainUtil;
