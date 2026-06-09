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

app.http('getPurchases', {
  route: 'purchases',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (request) => {
    try {
      requireAuth(request);
      const pool = await getPool();
      const result = await pool.request().query(`
        SELECT id, [date], feed_type AS feedType, qty,
               cost_per_kg AS costPerKg, total_cost AS totalCost,
               supplier, notes, reorder_level AS reorderLevel,
               created_at AS createdAt
        FROM purchases
        ORDER BY [date] DESC, created_at DESC
      `);
      return { status: 200, jsonBody: result.recordset };
    } catch (error) {
      return errorResponse(error, 'Failed to fetch purchases');
    }
  }
});

app.http('createPurchase', {
  route: 'purchases',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request) => {
    let tx;
    try {
      requireAuth(request);
      const body = await request.json();
      const { date, feedType, qty, costPerKg, supplier, notes, reorderLevel, sourceLocalId } = body || {};

      if (!date || !feedType || Number(qty) <= 0 || Number(costPerKg) < 0) {
        return { status: 400, jsonBody: { error: 'date, feedType, qty, and costPerKg are required' } };
      }

      tx = new sql.Transaction(await getPool());
      await tx.begin();

      if (sourceLocalId) {
        const existing = await new sql.Request(tx)
          .input('sourceLocalId', sql.NVarChar(120), sourceLocalId)
          .query(`
            SELECT id, [date], feed_type AS feedType, qty,
                   cost_per_kg AS costPerKg, total_cost AS totalCost,
                   supplier, notes, reorder_level AS reorderLevel,
                   created_at AS createdAt
            FROM purchases
            WHERE source_local_id = @sourceLocalId
          `);
        if (existing.recordset.length) {
          await tx.commit();
          return { status: 200, jsonBody: existing.recordset[0] };
        }
      }

      const nQty = Number(qty);
      const nCost = Number(costPerKg);
      const total = nQty * nCost;

      const inserted = await new sql.Request(tx)
        .input('date', sql.Date, date)
        .input('feedType', sql.NVarChar(40), feedType)
        .input('qty', sql.Decimal(10, 2), nQty)
        .input('costPerKg', sql.Decimal(18, 2), nCost)
        .input('totalCost', sql.Decimal(18, 2), total)
        .input('supplier', sql.NVarChar(120), supplier || null)
        .input('notes', sql.NVarChar(sql.MAX), notes || null)
        .input('reorderLevel', sql.Decimal(10, 2), Number(reorderLevel || 0))
        .input('sourceLocalId', sql.NVarChar(120), sourceLocalId || null)
        .query(`
          INSERT INTO purchases ([date], feed_type, qty, cost_per_kg, total_cost, supplier, notes, reorder_level, source_local_id, created_at)
          OUTPUT INSERTED.id, INSERTED.[date], INSERTED.feed_type AS feedType, INSERTED.qty,
                 INSERTED.cost_per_kg AS costPerKg, INSERTED.total_cost AS totalCost,
                 INSERTED.supplier, INSERTED.notes, INSERTED.reorder_level AS reorderLevel,
                 INSERTED.created_at AS createdAt
          VALUES (@date, @feedType, @qty, @costPerKg, @totalCost, @supplier, @notes, @reorderLevel, @sourceLocalId, SYSUTCDATETIME())
        `);

      const purchaseId = inserted.recordset[0]?.id;
      await new sql.Request(tx)
        .input('date', sql.Date, date)
        .input('amount', sql.Decimal(18, 2), total)
        .input('desc', sql.NVarChar(255), `Feed purchase: ${feedType} (${nQty}kg from ${supplier || 'supplier'})`)
        .input('txnSourceLocalId', sql.NVarChar(120), purchaseId ? `purchase:${purchaseId}` : null)
        .query(`
          INSERT INTO transactions ([date], [type], category, [description], amount, [method], [ref], source_local_id, created_at)
          VALUES (@date, 'expense', 'feed', @desc, @amount, 'cash', '', @txnSourceLocalId, SYSUTCDATETIME())
        `);

      await tx.commit();
      return { status: 201, jsonBody: inserted.recordset[0] };
    } catch (error) {
      try { if (tx) await tx.rollback(); } catch {}
      return errorResponse(error, 'Failed to create purchase');
    }
  }
});

app.http('deletePurchase', {
  route: 'purchases/{id}',
  methods: ['DELETE'],
  authLevel: 'anonymous',
  handler: async (request) => {
    let tx;
    try {
      requireAuth(request);
      const id = request.params.id;
      if (!id) return { status: 400, jsonBody: { error: 'id is required' } };

      tx = new sql.Transaction(await getPool());
      await tx.begin();

      const del = await new sql.Request(tx)
        .input('id', sql.UniqueIdentifier, id)
        .query('DELETE FROM purchases WHERE id = @id');

      if (!del.rowsAffected || del.rowsAffected[0] === 0) {
        await tx.rollback();
        return { status: 404, jsonBody: { error: 'Purchase not found' } };
      }

      await new sql.Request(tx)
        .input('txnSourceLocalId', sql.NVarChar(120), `purchase:${id}`)
        .query('DELETE FROM transactions WHERE source_local_id = @txnSourceLocalId');

      await tx.commit();
      return { status: 204 };
    } catch (error) {
      try { if (tx) await tx.rollback(); } catch {}
      return errorResponse(error, 'Failed to delete purchase');
    }
  }
});
