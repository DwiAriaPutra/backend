require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

if (!process.env.JWT_SECRET) {
    console.warn('WARNING: JWT_SECRET is not defined in .env, using default secret.');
}

module.exports = { JWT_SECRET };
