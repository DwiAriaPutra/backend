const express = require("express");
const router = express.Router();
const { jurusan } = require("../config/passport");

router.get("/", (req, res) => {
  // Handle GET request for jurusan
  res.json({
    message: "List of jurusan",
    jurusan,
  });
});

module.exports = router;
