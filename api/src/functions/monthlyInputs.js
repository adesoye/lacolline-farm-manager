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

function parseSpecificPigs(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

app.http('getMonthlyInputs', {
  route: 'monthly-inputs',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (request) => {
    try {
      requireAuth(request);
      const pool = await getPool();
      const result = await pool.request().query(`
        SELECT id, [month], category, product, scope,
               specific_pigs_json AS specificPigsJson,
               qty, unit_cost AS unitCost, total_cost AS totalCost,
               administered_by AS administeredBy,
               next_due AS nextDue,
               supplier, withdrawal, notes,
               created_at AS createdAt
        FROM monthly_inputs
        ORDER BY [month] DESC, created_at DESC
      `);

      const mapped = result.recordset.map(r => ({
        ...r,
        specificPigs: parseSpecificPigs(r.specificPigsJson)
      }));
      return { status: 200, jsonBody: mapped };
    } catch (error) {
      return errorResponse(error, 'Failed to fetch monthly inputs');
    }
  }
});

app.http('createMonthlyInput', {
  route: 'monthly-inputs',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request) => {
    let tx;
    try {
      requireAuth(request);
      const body = await request.json();
      const {
        month,
        category,
        product,
        scope,
        specificPigs,
        qty,
        unitCost,
        totalCost,
        administeredBy,
        nextDue,
        supplier,
        withdrawal,
        notes,
        sourceLocalId,
        addExpense
      } = body || {};

      if (!month || !category || !product) {
        return { status: 400, jsonBody: { error: 'month, category, and product are required' } };
      }

      tx = new sql.Transaction(await getPool());
      await tx.begin();

      if (sourceLocalId) {
        const existing = await new sql.Request(tx)
          .input('sourceLocalId', sql.NVarChar(120), sourceLocalId)
          .query(`
            SELECT id, [month], category, product, scope,
                   specific_pigs_json AS specificPigsJson,
                   qty, unit_cost AS unitCost, total_cost AS totalCost,
                   administered_by AS administeredBy,
                   next_due AS nextDue,
                   supplier, withdrawal, notes,
                   created_at AS createdAt
            FROM monthly_inputs
            WHERE source_local_id = @sourceLocalId
          `);
        if (existing.recordset.length) {
          await tx.commit();
          const row = existing.recordset[0];
          return {
            status: 200,
            jsonBody: {
              ...row,
              specificPigs: parseSpecificPigs(row.specificPigsJson)
            }
          };
        }
      }

      const nUnit = Number(unitCost || 0);
      const nTotal = Number(totalCost || 0);
      const nWithdrawal = Number(withdrawal || 0);
      const pigsJson = JSON.stringify(Array.isArray(specificPigs) ? specificPigs : []);

      const inserted = await new sql.Request(tx)
        .input('month', sql.NVarChar(7), month)
        .input('category', sql.NVarChar(40), category)
        .input('product', sql.NVarChar(150), product)
        .input('scope', sql.NVarChar(40), scope || null)
        .input('specificPigsJson', sql.NVarChar(sql.MAX), pigsJson)
        .input('qty', sql.NVarChar(120), qty || null)
        .input('unitCost', sql.Decimal(18, 2), nUnit)
        .input('totalCost', sql.Decimal(18, 2), nTotal)
        .input('administeredBy', sql.NVarChar(120), administeredBy || null)
        .input('nextDue', sql.Date, nextDue || null)
        .input('supplier', sql.NVarChar(120), supplier || null)
        .input('withdrawal', sql.Int, nWithdrawal)
        .input('notes', sql.NVarChar(sql.MAX), notes || null)
        .input('sourceLocalId', sql.NVarChar(120), sourceLocalId || null)
        .query(`
          INSERT INTO monthly_inputs (
            [month], category, product, scope, specific_pigs_json,
            qty, unit_cost, total_cost, administered_by, next_due,
            supplier, withdrawal, notes, source_local_id, created_at
          )
          OUTPUT INSERTED.id, INSERTED.[month], INSERTED.category, INSERTED.product,
                 INSERTED.scope, INSERTED.specific_pigs_json AS specificPigsJson,
                 INSERTED.qty, INSERTED.unit_cost AS unitCost, INSERTED.total_cost AS totalCost,
                 INSERTED.administered_by AS administeredBy, INSERTED.next_due AS nextDue,
                 INSERTED.supplier, INSERTED.withdrawal, INSERTED.notes,
                 INSERTED.created_at AS createdAt
          VALUES (
            @month, @category, @product, @scope, @specificPigsJson,
            @qty, @unitCost, @totalCost, @administeredBy, @nextDue,
            @supplier, @withdrawal, @notes, @sourceLocalId, SYSUTCDATETIME()
          )
        `);

      if (addExpense && nTotal > 0) {
        const monthlyId = inserted.recordset[0]?.id;
        await new sql.Request(tx)
          .input('date', sql.Date, `${month}-01`)
          .input('amount', sql.Decimal(18, 2), nTotal)
          .input('desc', sql.NVarChar(255), `${category}: ${product} (${month})`)
          .input('txnSourceLocalId', sql.NVarChar(120), monthlyId ? `monthly:${monthlyId}` : null)
          .query(`
            INSERT INTO transactions ([date], [type], category, [description], amount, [method], [ref], source_local_id, created_at)
            VALUES (@date, 'expense', 'medicine', @desc, @amount, 'cash', '', @txnSourceLocalId, SYSUTCDATETIME())
          `);
      }

      await tx.commit();
      const row = inserted.recordset[0];
      return {
        status: 201,
        jsonBody: {
          ...row,
          specificPigs: parseSpecificPigs(row.specificPigsJson)
        }
      };
    } catch (error) {
      try { if (tx) await tx.rollback(); } catch {}
      return errorResponse(error, 'Failed to create monthly input');
    }
  }
});

app.http('deleteMonthlyInput', {
  route: 'monthly-inputs/{id}',
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
        .query('DELETE FROM monthly_inputs WHERE id = @id');

      if (!del.rowsAffected || del.rowsAffected[0] === 0) {
        await tx.rollback();
        return { status: 404, jsonBody: { error: 'Monthly input not found' } };
      }

      await new sql.Request(tx)
        .input('txnSourceLocalId', sql.NVarChar(120), `monthly:${id}`)
        .query('DELETE FROM transactions WHERE source_local_id = @txnSourceLocalId');

      await tx.commit();
      return { status: 204 };
    } catch (error) {
      try { if (tx) await tx.rollback(); } catch {}
      return errorResponse(error, 'Failed to delete monthly input');
    }
  }
});
