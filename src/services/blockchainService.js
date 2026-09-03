const crypto = require('crypto');

const generateHash = (data) => {
    return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
};

const storeOnChain = async (hash) => {
    const mockTxHash = '0x' + crypto.randomBytes(32).toString('hex');
    return {
        txHash: mockTxHash,
        network: 'simulated-sepolia',
        blockNumber: Math.floor(Math.random() * 1000000)
    };
};

module.exports = { generateHash, storeOnChain };