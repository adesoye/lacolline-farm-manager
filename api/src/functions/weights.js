const { app } = require('@azure/functions');
const { getPool, sql } = require('../db');
const { requireAuth } = require('../auth');

function errorResponse(error, fallbackMessage) {
  const status = error?.status || 500;
  if (status !== 500) {
    return { status, jsonBody: { error: error.message || 'Request failed' } };
  }
  return { status: 500, jsonBody: { error: fallbackMessage, detail: error.message } };
}

app.http('getWeights', {
  route: 'weights',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (request) => {
    try {
      requireAuth(request);
      const pool = await getPool();
      const result = await pool.request().query(`
        SELECT id, pig_id AS pigId, [date], weight, bcs, notes, created_at AS createdAt
        FROM weights
        ORDER BY [date] DESC, created_at DESC
      `);
      return { status: 200, jsonBody: result.recordset };
    } catch (error) {
      return errorResponse(error, 'Failed to fetch weights');
    }
  }
});

app.http('createWeight', {
  route: 'weights',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request) => {
    try {
      requireAuth(request);
      const body = await request.json();
      const { pigId, date, weight, bcs, notes, sourceLocalId } = body || {};

      if (!pigId || !date || Number(weight) <= 0) {
        return { status: 400, jsonBody: { error: 'pigId, date, and weight are required' } };
      }

      const pool = await getPool();
      if (sourceLocalId) {
        const existing = await pool.request()
          .input('sourceLocalId', sql.NVarChar(120), sourceLocalId)
          .query(`
            SELECT id, pig_id AS pigId, [date], weight, bcs, notes, created_at AS createdAt
            FROM weights
            WHERE source_local_id = @sourceLocalId
          `);
        if (existing.recordset.length) {
          return { status: 200, jsonBody: existing.recordset[0] };
        }
      }

      const result = await pool
        .request()
        .input('pigId', sql.UniqueIdentifier, pigId)
        .input('date', sql.Date, date)
        .input('sourceLocalId', sql.NVarChar(120), sourceLocalId || null)
        .input('weight', sql.Decimal(10, 2), Number(weight))
        .input('bcs', sql.NVarChar(10), bcs || null)
        .input('notes', sql.NVarChar(sql.MAX), notes || null)
        .query(`
          INSERT INTO weights (pig_id, [date], source_local_id, weight, bcs, notes, created_at)
          OUTPUT INSERTED.id, INSERTED.pig_id AS pigId, INSERTED.[date], INSERTED.weight,
                 INSERTED.bcs, INSERTED.notes, INSERTED.created_at AS createdAt
          VALUES (@pigId, @date, @sourceLocalId, @weight, @bcs, @notes, SYSUTCDATETIME())
        `);

      return { status: 201, jsonBody: result.recordset[0] };
    } catch (error) {
      return errorResponse(error, 'Failed to create weight');
    }
  }
});

app.http('deleteWeight', {
  route: 'weights/{id}',
  methods: ['DELETE'],
  authLevel: 'anonymous',
  handler: async (request) => {
    try {
      requireAuth(request);
      const id = request.params.id;
      if (!id) return { status: 400, jsonBody: { error: 'id is required' } };

      const pool = await getPool();
      const result = await pool
        .request()
        .input('id', sql.UniqueIdentifier, id)
        .query('DELETE FROM weights WHERE id = @id');

      if (!result.rowsAffected || result.rowsAffected[0] === 0) {
        return { status: 404, jsonBody: { error: 'Weight record not found' } };
      }

      return { status: 204 };
    } catch (error) {
      return errorResponse(error, 'Failed to delete weight');
    }
  }
});
