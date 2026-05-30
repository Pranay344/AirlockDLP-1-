const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getAdminById } = require('./db');

// Local dev secret. For production this would come from an env var.
const JWT_SECRET = process.env.AIRLOCK_JWT_SECRET || 'airlock-local-dev-secret-change-me';
const TOKEN_TTL = '30d';

function hashPassword(plain) {
    return bcrypt.hashSync(plain, 10);
}

function verifyPassword(plain, hash) {
    return bcrypt.compareSync(plain, hash);
}

function signToken(adminId) {
    return jwt.sign({ adminId }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

// Express middleware: requires a valid Bearer token, attaches req.admin.
function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing token' });
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        const admin = getAdminById(payload.adminId);
        if (!admin) return res.status(401).json({ error: 'Invalid token' });
        req.admin = admin;
        next();
    } catch (e) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

function generateOrgCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
    let code = '';
    for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

module.exports = { hashPassword, verifyPassword, signToken, requireAuth, generateOrgCode };
