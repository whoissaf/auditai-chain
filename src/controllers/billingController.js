const db = require('../config/db');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const PRICING = {
    starter: { price: 4900, name: 'Starter Plan', audits: 10, lines: 1000 },
    pro: { price: 14900, name: 'Pro Plan', audits: 50, lines: 5000 }
};

const upgradeSubscription = async (req, res) => {
    try {
        const { tier } = req.body;
        const userId = req.user.id;
        const email = req.user.email;

        if (!['starter', 'pro'].includes(tier)) {
            return res.status(400).json({ error: 'Invalid tier. Must be starter or pro.' });
        }

        const plan = PRICING[tier];
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: { name: plan.name, description: `${plan.audits} audits/mo` },
                    unit_amount: plan.price,
                    recurring: { interval: 'month' }
                },
                quantity: 1
            }],
            mode: 'subscription',
            success_url: 'http://localhost:3000/billing/success?session_id={CHECKOUT_SESSION_ID}',
            cancel_url: 'http://localhost:3000/billing/cancel',
            customer_email: email,
            metadata: { user_id: userId.toString(), tier: tier }
        });

        res.json({ checkout_url: session.url });
    } catch (error) {
        console.error('Upgrade error:', error);
        res.status(500).json({ error: 'Failed to create checkout session' });
    }
};

const handleWebhook = async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const userId = session.metadata.user_id;
        const tier = session.metadata.tier;

        db.run(
            'INSERT OR REPLACE INTO subscriptions (user_id, tier, stripe_customer_id, stripe_subscription_id, status) VALUES (?, ?, ?, ?, ?)',
            [userId, tier, session.customer, session.subscription, 'active'],
            (err) => { if (err) console.error('DB update error:', err); }
        );
        db.run('UPDATE users SET tier = ? WHERE id = ?', [tier, userId]);
        console.log(`User ${userId} upgraded to ${tier}`);
    }

    res.json({ received: true });
};

const getSubscription = (req, res) => {
    const userId = req.user.id;
    db.get('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', [userId], (err, sub) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        db.get('SELECT tier FROM users WHERE id = ?', [userId], (err, user) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json({ subscription: sub || null, current_tier: user ? user.tier : 'free' });
        });
    });
};

module.exports = { upgradeSubscription, handleWebhook, getSubscription };
