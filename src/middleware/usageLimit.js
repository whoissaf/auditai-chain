const db = require('../config/db');

const checkUsageLimit = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const tier = req.user.tier || 'free';

        // Get tier limits
        db.get('SELECT max_lines_per_audit, max_audits_per_month FROM tier_limits WHERE tier = ?', [tier], async (err, limit) => {
            if (err) {
                console.error('Error fetching tier limits:', err);
                return next();
            }

            if (!limit) {
                return next();
            }

            // Check current month usage
            const currentMonth = new Date().toISOString().slice(0, 7);
            
            db.get(`SELECT COUNT(*) as audit_count, SUM(lines_of_code) as total_lines 
                    FROM audits 
                    WHERE user_id = ? AND created_at LIKE ?`, 
                [userId, currentMonth + '%'], 
                (err, usage) => {
                    if (err) {
                        console.error('Error fetching usage:', err);
                        return next();
                    }

                    req.usageLimits = {
                        maxLines: limit.max_lines_per_audit,
                        maxAudits: limit.max_audits_per_month,
                        currentAudits: usage?.audit_count || 0,
                        currentLines: usage?.total_lines || 0
                    };

                    next();
                }
            );
        });
    } catch (error) {
        console.error('Usage limit check error:', error);
        next();
    }
};

module.exports = { checkUsageLimit };
