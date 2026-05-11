const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const db = require("./db");

const jurusan = {
  7006: "Teknik Informatika",
  7007: "Sistem Informasi",
  7001: "Teknik Sipil",
  7002: "Teknik Elektro",
};

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:
        process.env.GOOGLE_CALLBACK_URL ||
        "http://localhost:5000/api/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const { id: googleId, emails, displayName } = profile;
        const email = emails[0].value;
        const nim = email.split("@")[0];
        const code = nim.substring(2, 6);
        const jurusanName = jurusan[Number(code)];

        let user = await db("users")
          .where("google_id", googleId)
          .orWhere("email", email)
          .orWhere("nim", nim)
          .first();

        if (!user) {
          const [newUserId] = await db("users")
            .insert({
              nama: displayName,
              nim: nim,
              jurusan: jurusanName,
              email: email,
              google_id: googleId,
              role: "user",
            })
            .returning("id");

          const userId =
            typeof newUserId === "object" ? newUserId.id : newUserId;
          user = await db("users").where("id", userId).first();
        } else {
          const updateData = {};

          if (!user.google_id) {
            updateData.google_id = googleId;
          }
          if (!user.email) {
            updateData.email = email;
          }
          if (!user.jurusan && jurusanName) {
            updateData.jurusan = jurusanName;
          }
          if (!user.nim) {
            updateData.nim = nim;
          }

          if (Object.keys(updateData).length > 0) {
            await db("users").where("id", user.id).update(updateData);
            user = await db("users").where("id", user.id).first();
          }
          user.google_id = googleId;
        }

        return done(null, user);
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await db("users").where("id", id).first();
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

module.exports = { passport, jurusan };
