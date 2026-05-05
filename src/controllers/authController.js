const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/jwt');

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
            .first();

        if (!user) {
            return res.status(401).json({ message: 'NIM/Nama atau password salah' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'NIM/Nama atau password salah' });
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
                jurusan: user.jurusan
            } 
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
