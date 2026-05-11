const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const { jurusan } = require("../config/passport");

router.get("/", verifyToken, (req, res) => {
  // Handle GET request for jurusan
  res.json({
    message: "List of jurusan",
    jurusan,
  });
});

module.exports = router;
