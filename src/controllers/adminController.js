const db = require('../config/db');

exports.getDashboardStats = async (req, res) => {
    try {
        // 1. Total Mahasiswa (User role)
        const userCount = await db('users').where('role', 'user').count('id as total_users').first();
        const totalUsers = parseInt(userCount.total_users);

        // 2. Total Lokasi
        const locationCount = await db('location').count('id as total_locations').first();
        const totalLocations = parseInt(locationCount.total_locations);

        // 3. Total Kuota (Sum of total_max from quotas)
        const quotaSum = await db('quotas').sum('total_max as total_quota').first();
        const totalQuota = parseInt(quotaSum.total_quota) || 0;

        // 4. Kuota Terisi
        const filledSum = await db('quotas').sum('current_filled as total_filled').first();
        const totalFilled = parseInt(filledSum.total_filled) || 0;

        // 5. Lokasi Terbaru (Limit 5)
        const recentLocations = await db('location as l')
            .leftJoin('quotas as q', 'l.id', 'q.location_id')
            .select('l.id', 'l.nama_lokasi', 'l.alamat')
            .sum('q.total_max as total_capacity')
            .sum('q.current_filled as total_filled')
            .groupBy('l.id')
            .orderBy('l.id', 'desc')
            .limit(5);

        res.json({
            totalUsers,
            totalLocations,
            totalQuota,
            totalFilled,
            recentLocations
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getRecentActivities = async (req, res) => {
    try {
        const adminId = req.user.id;
        const activities = await db('activities')
            .where('admin_id', adminId)
            .orderBy('created_at', 'desc')
            .limit(50);
        res.json(activities);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getStudents = async (req, res) => {
    try {
        const onlineUsers = req.onlineUsers || new Map();
        const students = await db('users')
            .where('role', 'user')
            .select('id', 'nama', 'nim', 'jurusan', 'gender', 'created_at')
            .orderBy('nama', 'asc');

        res.json(students.map((student) => ({
            ...student,
            is_online: onlineUsers.has(Number(student.id))
        })));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getPublicActivities = async (req, res) => {
    try {
        const activities = await db('activities')
            .select('activity_type', 'description', 'created_at')
            .orderBy('created_at', 'desc')
            .limit(50);
        res.json(activities);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
