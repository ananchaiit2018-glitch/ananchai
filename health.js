const { send } = require('../lib/http');

module.exports = async (req, res) => {
  const db = process.env.DATABASE_URL ? 'neon' : (process.env.USE_MEMORY_DB === '1' ? 'memory' : null);
  send(res, 200, {
    ok: true,
    db,
    setup: {
      passcode: !!process.env.APP_PASSCODE,
      secret: !!process.env.SESSION_SECRET,
      database: !!db,
      publicView: process.env.PUBLIC_VIEW === '1'
    }
  });
};
