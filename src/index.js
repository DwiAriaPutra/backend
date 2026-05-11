require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const session = require("express-session");
const { passport } = require("./config/passport");
const db = require("./config/db");
const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("./config/jwt");

const app = express();
const server = http.createServer(app);
const onlineUsers = new Map();
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "secret",
    resave: false,
    saveUninitialized: false,
  })
);
app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
  req.io = io;
  req.onlineUsers = onlineUsers;
  next();
});

// Import Routes
const locationRoutes = require("./routes/locationRoutes");
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const jurusanRoutes = require("./routes/jurusanRoutes");

// Database Initialization with Knex
const initDB = async () => {
  try {
    const hasTable = await db.schema.hasTable("activities");
    if (!hasTable) {
      await db.schema.createTable("activities", (table) => {
        table.increments("id").primary();
        table
          .integer("admin_id")
          .unsigned()
          .references("id")
          .inTable("users")
          .onDelete("CASCADE");
        table.string("activity_type").notNullable();
        table.text("description").notNullable();
        table.timestamp("created_at").defaultTo(db.fn.now());
      });
      console.log("Database initialized: activities table created.");
    } else {
      console.log("Database initialized: activities table already exists.");
    }
  } catch (err) {
    console.error("Database initialization error:", err);
  }
};
initDB();

app.use("/api/auth", authRoutes);
app.use("/api/locations", locationRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/jurusan", jurusanRoutes);

app.get("/", (req, res) => {
  res.json({ message: "Welcome to the Selection System API" });
});

io.on("connection", (socket) => {
  const token = socket.handshake.auth?.token;

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.data.user = decoded;

      if (decoded.role === "user") {
        const userId = Number(decoded.id);
        const sockets = onlineUsers.get(userId) || new Set();
        sockets.add(socket.id);
        onlineUsers.set(userId, sockets);
        io.emit("student_status_update", { userId, is_online: true });
      }
    } catch (error) {
      console.error("Socket authentication error:", error.message);
    }
  }

  console.log("User connected:", socket.id);
  socket.on("disconnect", () => {
    const user = socket.data.user;

    if (user?.role === "user") {
      const userId = Number(user.id);
      const sockets = onlineUsers.get(userId);

      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          onlineUsers.delete(userId);
          io.emit("student_status_update", { userId, is_online: false });
        } else {
          onlineUsers.set(userId, sockets);
        }
      }
    }

    console.log("User disconnected:", socket.id);
  });
});

// BACKGROUND TASK: Cleanup Expired Locks using Knex
setInterval(async () => {
  try {
    await db.transaction(async (trx) => {
      const expiredLocks = await trx("temporary_locks")
        .where("expires_at", "<", db.fn.now())
        .select("id", "quota_id", "location_id", "user_id");

      if (expiredLocks.length > 0) {
        console.log(`Cleaning up ${expiredLocks.length} expired locks...`);

        // Group by quota_id to decrement in batch
        const quotaCounts = expiredLocks.reduce((acc, lock) => {
          acc[lock.quota_id] = (acc[lock.quota_id] || 0) + 1;
          return acc;
        }, {});

        // Update quotas in batch (one query per unique quota_id)
        for (const [quotaId, count] of Object.entries(quotaCounts)) {
          await trx("quotas")
            .where("id", quotaId)
            .decrement("current_locked", count);
        }

        // Delete all expired locks in one query
        await trx("temporary_locks")
          .whereIn(
            "id",
            expiredLocks.map((l) => l.id)
          )
          .del();

        // Notify all clients about the quota updates
        const uniqueLocationIds = [
          ...new Set(expiredLocks.map((l) => l.location_id)),
        ];
        uniqueLocationIds.forEach((locId) => {
          io.emit("quota_update", { location_id: locId });
        });

        console.log(`Cleaned up ${expiredLocks.length} locks successfully.`);
      }
    });
  } catch (error) {
    console.error("Cleanup Task Error:", error);
  }
}, 30000);

const PORT = 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
