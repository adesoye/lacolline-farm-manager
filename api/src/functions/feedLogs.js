const { app } = require('@azure/functions');
const { getPool, sql } = require('../db');
const { requireAuth } = require('../auth');

app.http('getFeedLogs', {
  route: 'feed-logs',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (request) => {
    try {
      requireAuth(request);
      const pool = await getPool();
      const result = await pool.request().query(`
        SELECT id, [date], pig_id AS pigId, feed_type AS feedType, amount,
               cost_per_kg AS costPerKg, total_cost AS totalCost,
               feeding_time AS [time], notes, created_at AS createdAt
        FROM feed_logs
        ORDER BY [date] DESC, created_at DESC
      `);
      return { status: 200, jsonBody: result.recordset };
    } catch (error) {
      return { status: 500, jsonBody: { error: 'Failed to fetch feed logs', detail: error.message } };
    }
  }
});

app.http('createFeedLog', {
  route: 'feed-logs',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request) => {
    try {
      requireAuth(request);
      const body = await request.json();
      const { date, pigId, feedType, amount, costPerKg, time, notes, sourceLocalId } = body || {};

      if (!date || !pigId || !feedType || Number(amount) <= 0) {
        return { status: 400, jsonBody: { error: 'date, pigId, feedType, and amount are required' } };
      }

      const pool = await getPool();
      if (sourceLocalId) {
        const existing = await pool.request()
          .input('sourceLocalId', sql.NVarChar(120), sourceLocalId)
          .query(`
            SELECT id, [date], pig_id AS pigId, feed_type AS feedType, amount,
                   cost_per_kg AS costPerKg, total_cost AS totalCost,
                   feeding_time AS [time], notes, created_at AS createdAt
            FROM feed_logs
            WHERE source_local_id = @sourceLocalId
          `);
        if (existing.recordset.length) {
          return { status: 200, jsonBody: existing.recordset[0] };
        }
      }

      const nAmount = Number(amount);
      const nCost = Number(costPerKg || 0);

      const result = await pool.request()
        .input('date', sql.Date, date)
        .input('pigId', sql.UniqueIdentifier, pigId)
        .input('feedType', sql.NVarChar(40), feedType)
        .input('amount', sql.Decimal(10, 2), nAmount)
        .input('costPerKg', sql.Decimal(18, 2), nCost)
        .input('totalCost', sql.Decimal(18, 2), nAmount * nCost)
        .input('time', sql.NVarChar(20), time || null)
        .input('notes', sql.NVarChar(sql.MAX), notes || null)
        .input('sourceLocalId', sql.NVarChar(120), sourceLocalId || null)
        .query(`
          INSERT INTO feed_logs ([date], pig_id, feed_type, amount, cost_per_kg, total_cost, feeding_time, notes, source_local_id, created_at)
          OUTPUT INSERTED.id, INSERTED.[date], INSERTED.pig_id AS pigId, INSERTED.feed_type AS feedType,
                 INSERTED.amount, INSERTED.cost_per_kg AS costPerKg, INSERTED.total_cost AS totalCost,
                 INSERTED.feeding_time AS [time], INSERTED.notes, INSERTED.created_at AS createdAt
          VALUES (@date, @pigId, @feedType, @amount, @costPerKg, @totalCost, @time, @notes, @sourceLocalId, SYSUTCDATETIME())
        `);

      return { status: 201, jsonBody: result.recordset[0] };
    } catch (error) {
      return { status: 500, jsonBody: { error: 'Failed to create feed log', detail: error.message } };
    }
  }
});

app.http('deleteFeedLog', {
  route: 'feed-logs/{id}',
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
        .query('DELETE FROM feed_logs WHERE id = @id');

      if (!result.rowsAffected || result.rowsAffected[0] === 0) {
        return { status: 404, jsonBody: { error: 'Feed log not found' } };
      }

      return { status: 204 };
    } catch (error) {
      return { status: 500, jsonBody: { error: 'Failed to delete feed log', detail: error.message } };
    }
  }
});
