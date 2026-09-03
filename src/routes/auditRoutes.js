
const express = require('express');
const router = express.Router();
const { createAudit, getAudit, getFindings, exportReport, getUsageStats } = require('../controllers/auditController');
const authenticate = require('../middleware/auth');
const upload = require('../middleware/upload');

router.post('/', authenticate, upload.single('contract_file'), createAudit);
router.get('/usage', authenticate, getUsageStats);
router.get('/:id', authenticate, getAudit);
router.get('/:id/findings', authenticate, getFindings);
router.post('/:id/export', authenticate, exportReport);

module.exports = router;
