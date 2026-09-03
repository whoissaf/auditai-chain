const express = require('express');
const router = express.Router();
const { upgradeSubscription, handleWebhook, getSubscription } = require('../controllers/billingController');
const authenticate = require('../middleware/auth');

router.post('/upgrade', authenticate, upgradeSubscription);
router.post('/webhook', express.raw({ type: 'application/json' }), handleWebhook);
router.get('/subscription', authenticate, getSubscription);

module.exports = router;
