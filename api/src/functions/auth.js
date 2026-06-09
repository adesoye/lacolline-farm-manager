const { app } = require('@azure/functions');
const bcrypt = require('bcryptjs');
const { getPool, sql } = require('../db');
const { signUser, requireAuth } = require('../auth');

app.http('authLogin', {
  route: 'auth/login',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request) => {
    try {
      const body = await request.json();
      const username = String(body?.username || '').trim().toLowerCase();
      const password = String(body?.password || '');

      if (!username || !password) {
        return { status: 400, jsonBody: { error: 'Username and password are required' } };
      }

      const pool = await getPool();
      const result = await pool.request()
        .input('username', sql.NVarChar(80), username)
        .query(`
          SELECT id, username, full_name AS fullName, [role], active, password_hash AS passwordHash
          FROM app_users
          WHERE username = @username
        `);

      const user = result.recordset[0];
      if (!user || user.active === false) {
        return { status: 401, jsonBody: { error: 'Invalid username or password' } };
      }

      const ok = await bcrypt.compare(password, user.passwordHash || '');
      if (!ok) {
        return { status: 401, jsonBody: { error: 'Invalid username or password' } };
      }

      await pool.request()
        .input('id', sql.UniqueIdentifier, user.id)
        .query('UPDATE app_users SET last_login = SYSUTCDATETIME() WHERE id = @id');

      const safeUser = {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role
      };

      return {
        status: 200,
        jsonBody: {
          token: signUser(safeUser),
          user: safeUser
        }
      };
    } catch (error) {
      return { status: 500, jsonBody: { error: 'Login failed', detail: error.message } };
    }
  }
});

app.http('authMe', {
  route: 'auth/me',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (request) => {
    try {
      const user = requireAuth(request);
      return {
        status: 200,
        jsonBody: {
          user: {
            id: user.sub,
            username: user.username,
            fullName: user.fullName,
            role: user.role
          }
        }
      };
    } catch (error) {
      return { status: error.status || 401, jsonBody: { error: error.message } };
    }
  }
});
