const db = require('../config/db');

// 1. Ambil semua lokasi beserta kuota detail
exports.getAllLocations = async (req, res) => {
    try {
        const rows = await db('location as l')
            .leftJoin('quotas as q', 'l.id', 'q.location_id')
            .select(
                'l.id', 'l.nama_lokasi', 'l.alamat', 
                'q.id as quota_id', 'q.gender', 'q.total_max', 'q.current_filled', 'q.current_locked'
            );
        
        const locations = rows.reduce((acc, curr) => {
            const { id, nama_lokasi, alamat, ...quotaInfo } = curr;
            if (!acc[id]) {
                acc[id] = { id, nama_lokasi, alamat, quotas: [] };
            }
            if (quotaInfo.quota_id) {
                acc[id].quotas.push(quotaInfo);
            }
            return acc;
        }, {});

        res.json(Object.values(locations));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// 2. Admin: Tambah Lokasi dan Kuota
exports.createLocation = async (req, res) => {
    const { nama_lokasi, alamat, quotas } = req.body;
    const adminId = req.user.id;

    try {
        const locationId = await db.transaction(async (trx) => {
            const [newLoc] = await trx('location').insert({
                nama_lokasi,
                alamat
            }).returning('id');

            const locId = newLoc.id;

            if (quotas && quotas.length > 0) {
                const quotasToInsert = quotas.map(q => ({
                    location_id: locId,
                    gender: q.gender,
                    total_max: q.total_max
                }));
                await trx('quotas').insert(quotasToInsert);
            }

            // Log Activity
            await trx('activities').insert({
                admin_id: adminId,
                activity_type: 'ADD_LOCATION',
                description: `Menambah lokasi baru: ${nama_lokasi}`
            });

            return locId;
        });

        res.status(201).json({ message: 'Lokasi dan kuota berhasil ditambahkan', locationId });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// 3. Mekanisme Locking (User memilih lokasi, tapi belum konfirmasi)
exports.lockLocation = async (req, res) => {
    const user_id = req.user.id;
    const gender = req.user.gender;
    const { location_id } = req.body;

    try {
        const result = await db.transaction(async (trx) => {
            // A. Cek apakah user sudah punya pilihan final atau lock aktif secara paralel
            const [existingSelection, existingLock] = await Promise.all([
                trx('selection').where('user_id', user_id).first(),
                trx('temporary_locks').where('user_id', user_id).first()
            ]);

            if (existingSelection || existingLock) {
                throw new Error('Anda sudah memilih lokasi atau sedang memiliki antrean aktif.');
            }

            // B. Cek sisa kuota yang tersedia
            const quota = await trx('quotas')
                .where({ location_id, gender })
                .forUpdate()
                .first();

            if (!quota) throw new Error('Kuota untuk gender Anda tidak ditemukan di lokasi ini.');
            
            const available = quota.total_max - (quota.current_filled + quota.current_locked);

            if (available <= 0) {
                throw new Error('Kuota untuk gender Anda sudah habis di lokasi ini.');
            }

            // C. Tambahkan ke current_locked
            await trx('quotas')
                .where('id', quota.id)
                .increment('current_locked', 1);

            // D. Buat data temporary_locks (berlaku 5 menit)
            const expiresAt = new Date(Date.now() + 5 * 60000); 
            await trx('temporary_locks').insert({
                user_id,
                location_id,
                quota_id: quota.id,
                expires_at: expiresAt
            });

            return { expiresAt };
        });

        if (req.io) req.io.emit('quota_update', { location_id });

        res.json({ message: 'Lokasi berhasil dikunci sementara selama 5 menit.', expiresAt: result.expiresAt });

    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// 4. Mekanisme Konfirmasi Final
exports.confirmSelection = async (req, res) => {
    const user_id = req.user.id;

    try {
        const locationId = await db.transaction(async (trx) => {
            const lock = await trx('temporary_locks').where('user_id', user_id).first();

            if (!lock) throw new Error('Sesi lock tidak ditemukan atau sudah expired.');

            await trx('quotas')
                .where('id', lock.quota_id)
                .update({
                    current_locked: db.raw('current_locked - 1'),
                    current_filled: db.raw('current_filled + 1')
                });

            await trx('selection').insert({
                user_id,
                location_id: lock.location_id,
                quota_id: lock.quota_id
            });

            await trx('temporary_locks').where('user_id', user_id).del();

            return lock.location_id;
        });

        if (req.io) req.io.emit('quota_update', { location_id: locationId });

        res.json({ message: 'Pilihan lokasi berhasil dikonfirmasi!' });

    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// 4.1. Batalkan lock sementara
exports.cancelLock = async (req, res) => {
    const user_id = req.user.id;

    try {
        const locationId = await db.transaction(async (trx) => {
            const lock = await trx('temporary_locks').where('user_id', user_id).first();

            if (!lock) throw new Error('Tidak ada antrean aktif yang bisa dibatalkan.');

            await trx('quotas')
                .where('id', lock.quota_id)
                .decrement('current_locked', 1);

            await trx('temporary_locks').where('user_id', user_id).del();

            return lock.location_id;
        });

        if (req.io) req.io.emit('quota_update', { location_id: locationId });

        res.json({ message: 'Pilihan lokasi berhasil dibatalkan.' });

    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// 4.5. Ambil status pilihan user saat ini
exports.getMyStatus = async (req, res) => {
    const user_id = req.user.id;
    try {
        const selection = await db('selection').where('user_id', user_id).first();

        if (selection) {
            return res.json({ 
                isLocked: false, 
                isConfirmed: true, 
                locationId: selection.location_id 
            });
        }

        const lock = await db('temporary_locks').where('user_id', user_id).first();

        if (lock) {
            return res.json({ 
                isLocked: true, 
                isConfirmed: false, 
                locationId: lock.location_id,
                expiresAt: lock.expires_at
            });
        }

        res.json({ isLocked: false, isConfirmed: false, locationId: null });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// 5. Admin: Update Lokasi dan Kuota
exports.updateLocation = async (req, res) => {
    const { id } = req.params;
    const { nama_lokasi, alamat, quotas } = req.body;
    const adminId = req.user.id;

    try {
        await db.transaction(async (trx) => {
            await trx('location').where('id', id).update({
                nama_lokasi,
                alamat
            });

            if (quotas && quotas.length > 0) {
                for (const q of quotas) {
                    await trx('quotas')
                        .where({ location_id: id, gender: q.gender })
                        .update({ total_max: q.total_max });
                }
            }

            // Log Activity
            await trx('activities').insert({
                admin_id: adminId,
                activity_type: 'UPDATE_LOCATION',
                description: `Memperbarui lokasi: ${nama_lokasi}`
            });
        });

        if (req.io) req.io.emit('quota_update', { location_id: id });
        res.json({ message: 'Lokasi dan kuota berhasil diperbarui' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// 6. Admin: Hapus Lokasi
exports.deleteLocation = async (req, res) => {
    const { id } = req.params;
    const adminId = req.user.id;

    try {
        await db.transaction(async (trx) => {
            const location = await trx('location').where('id', id).first();
            if (!location) throw new Error('Lokasi tidak ditemukan');

            await trx('selection').where('location_id', id).del();
            await trx('temporary_locks').where('location_id', id).del();
            await trx('quotas').where('location_id', id).del();
            await trx('location').where('id', id).del();

            await trx('activities').insert({
                admin_id: adminId,
                activity_type: 'DELETE_LOCATION',
                description: `Menghapus lokasi: ${location.nama_lokasi}`
            });
        });

        if (req.io) req.io.emit('quota_update', { location_id: id });
        res.json({ message: 'Lokasi berhasil dihapus' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};
