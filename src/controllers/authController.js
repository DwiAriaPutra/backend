const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/jwt');
const { OAuth2Client } = require('google-auth-library');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

exports.register = async (req, res) => {
    const { nim, nama, password, gender, jurusan } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        
        if (!nim) {
            return res.status(400).json({ message: 'NIM wajib diisi' });
        }

        const [newUser] = await db('users').insert({
            nim,
            nama,
            password: hashedPassword,
            gender: gender || null,
            role: 'user',
            jurusan: jurusan || null
        }).returning('id');
        
        res.status(201).json({ message: 'Registrasi berhasil', userId: newUser.id });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

exports.login = async (req, res) => {
    const { identifier, password } = req.body;
    try {
        const user = await db('users')
            .where('nim', identifier)
            .orWhere('nama', identifier)
            .orWhere('email', identifier)
            .first();

        if (!user) {
            return res.status(401).json({ message: 'NIM/Nama/Email atau password salah' });
        }

        if (!user.password && user.google_id) {
            return res.status(401).json({ message: 'Akun ini terdaftar dengan Google. Silakan login menggunakan Google.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'NIM/Nama/Email atau password salah' });
        }

        const token = jwt.sign(
            { id: user.id, role: user.role, gender: user.gender, nama: user.nama, jurusan: user.jurusan },
            JWT_SECRET,
            { expiresIn: '2h' }
        );

        res.json({ 
            token, 
            user: { 
                id: user.id, 
                nim: user.nim, 
                nama: user.nama, 
                role: user.role, 
                gender: user.gender,
                jurusan: user.jurusan,
                email: user.email
            } 
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.googleLogin = async (req, res) => {
    const { credential } = req.body;
    try {
        const ticket = await client.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        const { sub: googleId, email, name, picture } = payload;

        let user = await db('users').where('google_id', googleId).orWhere('email', email).first();

        if (!user) {
            // Create new user if not exists
            const [newUserId] = await db('users').insert({
                nama: name,
                email: email,
                google_id: googleId,
                role: 'user',
                // password remains null
            }).returning('id');
            
            const userId = typeof newUserId === 'object' ? newUserId.id : newUserId;
            user = await db('users').where('id', userId).first();
        } else if (!user.google_id) {
            // Link existing user by email
            await db('users').where('id', user.id).update({ google_id: googleId });
            user.google_id = googleId;
        }

        const token = jwt.sign(
            { id: user.id, role: user.role, gender: user.gender, nama: user.nama, jurusan: user.jurusan },
            JWT_SECRET,
            { expiresIn: '2h' }
        );

        res.json({ 
            token, 
            user: { 
                id: user.id, 
                nim: user.nim, 
                nama: user.nama, 
                role: user.role, 
                gender: user.gender,
                jurusan: user.jurusan,
                email: user.email
            } 
        });
    } catch (error) {
        console.error('Google Login Error:', error);
        res.status(400).json({ message: 'Google authentication failed' });
    }
};

exports.passportCallback = async (req, res) => {
    try {
        const user = req.user;
        const token = jwt.sign(
            { id: user.id, role: user.role, gender: user.gender, nama: user.nama, jurusan: user.jurusan },
            JWT_SECRET,
            { expiresIn: '2h' }
        );

        // Redirect to frontend with token
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        res.redirect(`${frontendUrl}/login?token=${token}`);
    } catch (error) {
        console.error('Passport Callback Error:', error);
        res.status(500).redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?error=auth_failed`);
    }
};

exports.getProfile = async (req, res) => {
    try {
        const user = await db('users').where('id', req.user.id).first();
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json({
            id: user.id,
            nim: user.nim,
            nama: user.nama,
            role: user.role,
            gender: user.gender,
            jurusan: user.jurusan,
            email: user.email
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getPublicStats = async (req, res) => {
    try {
        const userCount = await db('users').where('role', 'user').count('id as total_users').first();
        res.json({ totalUsers: parseInt(userCount.total_users) });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.completeProfile = async (req, res) => {
    const { nim, gender, jurusan } = req.body;
    const userId = req.user.id;

    try {
        const currentUser = await db('users').where('id', userId).first();
        if (!currentUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        const finalNim = nim || currentUser.nim;
        const finalGender = gender || currentUser.gender;
        const finalJurusan = jurusan || currentUser.jurusan;

        if (!finalNim || !finalGender || !finalJurusan) {
            return res.status(400).json({ message: 'NIM, gender, dan jurusan wajib diisi' });
        }

        // Check if NIM already exists for another user
        const existingUser = await db('users').where('nim', finalNim).whereNot('id', userId).first();
        if (existingUser) {
            return res.status(400).json({ message: 'NIM sudah terdaftar' });
        }

        await db('users').where('id', userId).update({
            nim: finalNim,
            gender: finalGender,
            jurusan: finalJurusan,
            updated_at: new Date()
        });

        const updatedUser = await db('users').where('id', userId).first();

        const token = jwt.sign(
            { id: updatedUser.id, role: updatedUser.role, gender: updatedUser.gender, nama: updatedUser.nama, jurusan: updatedUser.jurusan },
            JWT_SECRET,
            { expiresIn: '2h' }
        );

        res.json({
            message: 'Profil berhasil dilengkapi',
            token,
            user: {
                id: updatedUser.id,
                nim: updatedUser.nim,
                nama: updatedUser.nama,
                role: updatedUser.role,
                gender: updatedUser.gender,
                jurusan: updatedUser.jurusan,
                email: updatedUser.email
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
