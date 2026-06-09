const { app } = require('@azure/functions');
const { getPool, sql } = require('../db');

app.http('getPigs', {
  route: 'pigs',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async () => {
    try {
      const pool = await getPool();
      const result = await pool.request().query(`
        SELECT id, tag, name, type, breed, dob, source, purchase_price AS purchasePrice,
               notes, status, created_at AS createdAt
        FROM pigs
        ORDER BY created_at DESC
      `);
      return { status: 200, jsonBody: result.recordset };
    } catch (error) {
      return { status: 500, jsonBody: { error: 'Failed to fetch pigs', detail: error.message } };
    }
  }
});

app.http('createPig', {
  route: 'pigs',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request) => {
    try {
      const body = await request.json();
      const { tag, name, type, breed, dob, source, purchasePrice, notes, sourceLocalId } = body || {};

      if (!tag || !type || !dob) {
        return { status: 400, jsonBody: { error: 'tag, type, and dob are required' } };
      }

      const pool = await getPool();
      if (sourceLocalId) {
        const existing = await pool.request()
          .input('sourceLocalId', sql.NVarChar(120), sourceLocalId)
          .query(`
            SELECT id, tag, name, type, breed, dob, source, purchase_price AS purchasePrice,
                   notes, status, created_at AS createdAt
            FROM pigs
            WHERE source_local_id = @sourceLocalId
          `);
        if (existing.recordset.length) {
          return { status: 200, jsonBody: existing.recordset[0] };
        }
      }

      const result = await pool
        .request()
        .input('tag', sql.NVarChar(50), tag)
        .input('name', sql.NVarChar(100), name || null)
        .input('type', sql.NVarChar(30), type)
        .input('breed', sql.NVarChar(100), breed || null)
        .input('dob', sql.Date, dob)
        .input('source', sql.NVarChar(30), source || null)
        .input('purchasePrice', sql.Decimal(18, 2), Number(purchasePrice || 0))
        .input('sourceLocalId', sql.NVarChar(120), sourceLocalId || null)
        .input('notes', sql.NVarChar(sql.MAX), notes || null)
        .query(`
          INSERT INTO pigs (tag, name, type, breed, dob, source, purchase_price, source_local_id, notes, status, created_at)
          OUTPUT INSERTED.id, INSERTED.tag, INSERTED.name, INSERTED.type, INSERTED.breed,
                 INSERTED.dob, INSERTED.source, INSERTED.purchase_price AS purchasePrice,
                 INSERTED.notes, INSERTED.status, INSERTED.created_at AS createdAt
          VALUES (@tag, @name, @type, @breed, @dob, @source, @purchasePrice, @sourceLocalId, @notes, 'active', SYSUTCDATETIME())
        `);

      return { status: 201, jsonBody: result.recordset[0] };
    } catch (error) {
      if (String(error.message || '').includes('UQ_pigs_tag')) {
        return { status: 409, jsonBody: { error: 'A pig with this tag already exists' } };
      }
      return { status: 500, jsonBody: { error: 'Failed to create pig', detail: error.message } };
    }
  }
});

app.http('deletePig', {
  route: 'pigs/{id}',
  methods: ['DELETE'],
  authLevel: 'anonymous',
  handler: async (request) => {
    try {
      const id = request.params.id;
      if (!id) return { status: 400, jsonBody: { error: 'id is required' } };

      const pool = await getPool();
      const result = await pool
        .request()
        .input('id', sql.UniqueIdentifier, id)
        .query('DELETE FROM pigs WHERE id = @id');

      if (!result.rowsAffected || result.rowsAffected[0] === 0) {
        return { status: 404, jsonBody: { error: 'Pig not found' } };
      }

      return { status: 204 };
    } catch (error) {
      return { status: 500, jsonBody: { error: 'Failed to delete pig', detail: error.message } };
    }
  }
});
