require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const db = require('./config/db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
    req.io = io;
    next();
});

// Import Routes
const locationRoutes = require('./routes/locationRoutes');
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');

// Database Initialization with Knex
const initDB = async () => {
    try {
        const hasTable = await db.schema.hasTable('activities');
        if (!hasTable) {
            await db.schema.createTable('activities', (table) => {
                table.increments('id').primary();
                table.integer('admin_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
                table.string('activity_type').notNullable();
                table.text('description').notNullable();
                table.timestamp('created_at').defaultTo(db.fn.now());
            });
            console.log('Database initialized: activities table created.');
        } else {
            console.log('Database initialized: activities table already exists.');
        }
    } catch (err) {
        console.error('Database initialization error:', err);
    }
};
initDB();

app.use('/api/auth', authRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/admin', adminRoutes);

app.get('/', (req, res) => {
    res.json({ message: 'Welcome to the Selection System API' });
});

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

// BACKGROUND TASK: Cleanup Expired Locks using Knex
setInterval(async () => {
    try {
        const expiredLocks = await db('temporary_locks')
            .where('expires_at', '<', db.fn.now());

        for (const lock of expiredLocks) {
            await db.transaction(async (trx) => {
                // Kembalikan current_locked di tabel quotas
                await trx('quotas')
                    .where('id', lock.quota_id)
                    .decrement('current_locked', 1);

                // Hapus dari temporary_locks
                await trx('temporary_locks')
                    .where('id', lock.id)
                    .del();

                io.emit('quota_update', { location_id: lock.location_id });
                console.log(`Expired lock cleaned for user_id: ${lock.user_id}`);
            });
        }
    } catch (error) {
        console.error('Cleanup Task Error:', error);
    }
}, 30000);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
