const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const db = require('./db');

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || "http://localhost:5000/api/auth/google/callback"
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const { id: googleId, emails, displayName } = profile;
      const email = emails[0].value;

      let user = await db('users').where('google_id', googleId).orWhere('email', email).first();

      if (!user) {
        const [newUserId] = await db('users').insert({
          nama: displayName,
          email: email,
          google_id: googleId,
          role: 'user',
        }).returning('id');
        
        const userId = typeof newUserId === 'object' ? newUserId.id : newUserId;
        user = await db('users').where('id', userId).first();
      } else if (!user.google_id) {
        await db('users').where('id', user.id).update({ google_id: googleId });
        user.google_id = googleId;
      }

      return done(null, user);
    } catch (error) {
      return done(error, null);
    }
  }
));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await db('users').where('id', id).first();
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

module.exports = passport;
