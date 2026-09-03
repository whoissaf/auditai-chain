const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

const register = async (req, res) => {
    try {
        const { email, password, name } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        db.get(`SELECT id FROM users WHERE email = ?`, [email], async (err, row) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            if (row) {
                return res.status(400).json({ error: 'Email already registered' });
            }

            const password_hash = await bcrypt.hash(password, 12);
            
            db.run(`INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)`, [email, password_hash, name], function(err) {
                if (err) {
                    return res.status(500).json({ error: 'Registration failed' });
                }
                
                const token = jwt.sign(
                    { id: this.lastID, email, role: 'user' }, 
                    process.env.JWT_SECRET, 
                    { expiresIn: '7d' }
                );
                
                res.status(201).json({ 
                    token, 
                    user: { 
                        id: this.lastID, 
                        email, 
                        name, 
                        role: 'user', 
                        tier: 'free' 
                    } 
                });
            });
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            if (!user) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const isMatch = await bcrypt.compare(password, user.password_hash);
            if (!isMatch) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }

            const token = jwt.sign(
                { id: user.id, email: user.email, role: user.role }, 
                process.env.JWT_SECRET, 
                { expiresIn: '7d' }
            );
            
            res.json({ 
                token, 
                user: { 
                    id: user.id, 
                    email: user.email, 
                    name: user.name, 
                    role: user.role, 
                    tier: user.tier 
                } 
            });
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
};

const getMe = (req, res) => {
    db.get(`SELECT id, email, name, company, role, tier, created_at FROM users WHERE id = ?`, [req.user.id], (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ user });
    });
};

module.exports = { register, login, getMe };
