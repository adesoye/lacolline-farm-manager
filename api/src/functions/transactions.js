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

app.http('getTransactions', {
  route: 'transactions',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (request) => {
    try {
      requireAuth(request);
      const pool = await getPool();
      const result = await pool.request().query(`
        SELECT id, [date], [type], category, [description], amount,
               [method], [ref], created_at AS createdAt
        FROM transactions
        ORDER BY [date] DESC, created_at DESC
      `);
      return { status: 200, jsonBody: result.recordset };
    } catch (error) {
      return errorResponse(error, 'Failed to fetch transactions');
    }
  }
});

app.http('createTransaction', {
  route: 'transactions',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request) => {
    try {
      requireAuth(request);
      const body = await request.json();
      const { date, type, category, description, amount, method, ref, sourceLocalId } = body || {};

      if (!date || !type || !category || !description || Number(amount) <= 0) {
        return { status: 400, jsonBody: { error: 'date, type, category, description, and amount are required' } };
      }

      const pool = await getPool();
      if (sourceLocalId) {
        const existing = await pool.request()
          .input('sourceLocalId', sql.NVarChar(120), sourceLocalId)
          .query(`
            SELECT id, [date], [type], category, [description], amount,
                   [method], [ref], created_at AS createdAt
            FROM transactions
            WHERE source_local_id = @sourceLocalId
          `);
        if (existing.recordset.length) {
          return { status: 200, jsonBody: existing.recordset[0] };
        }
      }

      const result = await pool.request()
        .input('date', sql.Date, date)
        .input('type', sql.NVarChar(20), type)
        .input('category', sql.NVarChar(50), category)
        .input('description', sql.NVarChar(255), description)
        .input('amount', sql.Decimal(18, 2), Number(amount))
        .input('method', sql.NVarChar(30), method || null)
        .input('ref', sql.NVarChar(100), ref || null)
        .input('sourceLocalId', sql.NVarChar(120), sourceLocalId || null)
        .query(`
          INSERT INTO transactions ([date], [type], category, [description], amount, [method], [ref], source_local_id, created_at)
          OUTPUT INSERTED.id, INSERTED.[date], INSERTED.[type], INSERTED.category,
                 INSERTED.[description], INSERTED.amount, INSERTED.[method], INSERTED.[ref],
                 INSERTED.created_at AS createdAt
          VALUES (@date, @type, @category, @description, @amount, @method, @ref, @sourceLocalId, SYSUTCDATETIME())
        `);

      return { status: 201, jsonBody: result.recordset[0] };
    } catch (error) {
      return errorResponse(error, 'Failed to create transaction');
    }
  }
});

app.http('deleteTransaction', {
  route: 'transactions/{id}',
  methods: ['DELETE'],
  authLevel: 'anonymous',
  handler: async (request) => {
    try {
      requireAuth(request);
      const id = request.params.id;
      if (!id) return { status: 400, jsonBody: { error: 'id is required' } };

      const pool = await getPool();
      const result = await pool.request()
        .input('id', sql.UniqueIdentifier, id)
        .query('DELETE FROM transactions WHERE id = @id');

      if (!result.rowsAffected || result.rowsAffected[0] === 0) {
        return { status: 404, jsonBody: { error: 'Transaction not found' } };
      }

      return { status: 204 };
    } catch (error) {
      return errorResponse(error, 'Failed to delete transaction');
    }
  }
});
