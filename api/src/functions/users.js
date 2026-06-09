const { app } = require('@azure/functions');
const bcrypt = require('bcryptjs');
const { getPool, sql } = require('../db');
const { requireAuth } = require('../auth');

app.http('getUsers', {
  route: 'users',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (request) => {
    try {
      requireAuth(request, { adminOnly: true });
      const pool = await getPool();
      const result = await pool.request().query(`
        SELECT id, username, full_name AS fullName, [role], active,
               created_at AS createdAt,
               CONVERT(NVARCHAR(10), last_login, 23) AS lastLogin
        FROM app_users
        ORDER BY created_at DESC
      `);
      return { status: 200, jsonBody: result.recordset };
    } catch (error) {
      return { status: error.status || 500, jsonBody: { error: error.message || 'Failed to fetch users' } };
    }
  }
});

app.http('createUser', {
  route: 'users',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request) => {
    try {
      requireAuth(request, { adminOnly: true });
      const body = await request.json();
      const fullName = String(body?.fullName || '').trim();
      const username = String(body?.username || '').trim().toLowerCase();
      const role = String(body?.role || 'user');
      const password = String(body?.password || '');

      if (!fullName || !username || !password) {
        return { status: 400, jsonBody: { error: 'fullName, username, and password are required' } };
      }
      if (!['admin', 'manager', 'user'].includes(role)) {
        return { status: 400, jsonBody: { error: 'Invalid role' } };
      }
      if (password.length < 6) {
        return { status: 400, jsonBody: { error: 'Password must be at least 6 characters' } };
      }

      const hash = await bcrypt.hash(password, 10);
      const pool = await getPool();
      const result = await pool.request()
        .input('fullName', sql.NVarChar(120), fullName)
        .input('username', sql.NVarChar(80), username)
        .input('role', sql.NVarChar(20), role)
        .input('passwordHash', sql.NVarChar(255), hash)
        .query(`
          INSERT INTO app_users (username, password_hash, full_name, [role], active, created_at)
          OUTPUT INSERTED.id, INSERTED.username, INSERTED.full_name AS fullName,
                 INSERTED.[role], INSERTED.active,
                 INSERTED.created_at AS createdAt,
                 CONVERT(NVARCHAR(10), INSERTED.last_login, 23) AS lastLogin
          VALUES (@username, @passwordHash, @fullName, @role, 1, SYSUTCDATETIME())
        `);

      return { status: 201, jsonBody: result.recordset[0] };
    } catch (error) {
      if (String(error.message || '').toLowerCase().includes('unique') || String(error.message || '').includes('UQ_app_users_username')) {
        return { status: 409, jsonBody: { error: 'Username already exists' } };
      }
      return { status: error.status || 500, jsonBody: { error: error.message || 'Failed to create user' } };
    }
  }
});

app.http('deleteUser', {
  route: 'users/{id}',
  methods: ['DELETE'],
  authLevel: 'anonymous',
  handler: async (request) => {
    try {
      const me = requireAuth(request, { adminOnly: true });
      const id = request.params.id;
      if (!id) return { status: 400, jsonBody: { error: 'id is required' } };
      if (id === me.sub) return { status: 400, jsonBody: { error: 'You cannot delete your own account' } };

      const pool = await getPool();
      const result = await pool.request()
        .input('id', sql.UniqueIdentifier, id)
        .query('DELETE FROM app_users WHERE id = @id');

      if (!result.rowsAffected || result.rowsAffected[0] === 0) {
        return { status: 404, jsonBody: { error: 'User not found' } };
      }
      return { status: 204 };
    } catch (error) {
      return { status: error.status || 500, jsonBody: { error: error.message || 'Failed to delete user' } };
    }
  }
});

app.http('setUserStatus', {
  route: 'users/{id}/status',
  methods: ['PATCH'],
  authLevel: 'anonymous',
  handler: async (request) => {
    try {
      const me = requireAuth(request, { adminOnly: true });
      const id = request.params.id;
      const body = await request.json();
      const active = Boolean(body?.active);

      if (!id) return { status: 400, jsonBody: { error: 'id is required' } };
      if (id === me.sub) return { status: 400, jsonBody: { error: 'You cannot change your own active status' } };

      const pool = await getPool();
      const result = await pool.request()
        .input('id', sql.UniqueIdentifier, id)
        .input('active', sql.Bit, active ? 1 : 0)
        .query(`
          UPDATE app_users
          SET active = @active
          OUTPUT INSERTED.id, INSERTED.username, INSERTED.full_name AS fullName,
                 INSERTED.[role], INSERTED.active,
                 INSERTED.created_at AS createdAt,
                 CONVERT(NVARCHAR(10), INSERTED.last_login, 23) AS lastLogin
          WHERE id = @id
        `);

      if (!result.recordset.length) return { status: 404, jsonBody: { error: 'User not found' } };
      return { status: 200, jsonBody: result.recordset[0] };
    } catch (error) {
      return { status: error.status || 500, jsonBody: { error: error.message || 'Failed to update user status' } };
    }
  }
});

app.http('changeUserPassword', {
  route: 'users/{id}/password',
  methods: ['PATCH'],
  authLevel: 'anonymous',
  handler: async (request) => {
    try {
      const me = requireAuth(request);
      const id = request.params.id;
      const body = await request.json();
      const newPassword = String(body?.newPassword || '');

      if (!id) return { status: 400, jsonBody: { error: 'id is required' } };
      if (me.role !== 'admin' && id !== me.sub) {
        return { status: 403, jsonBody: { error: 'You can only change your own password' } };
      }
      if (newPassword.length < 6) {
        return { status: 400, jsonBody: { error: 'Password must be at least 6 characters' } };
      }

      const hash = await bcrypt.hash(newPassword, 10);
      const pool = await getPool();
      const result = await pool.request()
        .input('id', sql.UniqueIdentifier, id)
        .input('passwordHash', sql.NVarChar(255), hash)
        .query('UPDATE app_users SET password_hash = @passwordHash WHERE id = @id');

      if (!result.rowsAffected || result.rowsAffected[0] === 0) {
        return { status: 404, jsonBody: { error: 'User not found' } };
      }

      return { status: 200, jsonBody: { ok: true } };
    } catch (error) {
      return { status: error.status || 500, jsonBody: { error: error.message || 'Failed to change password' } };
    }
  }
});
