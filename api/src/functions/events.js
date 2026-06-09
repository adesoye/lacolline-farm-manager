const { app } = require('@azure/functions');
const { getPool, sql } = require('../db');
const { requireAuth } = require('../auth');

app.http('getEvents', {
  route: 'events',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: async (request) => {
    try {
      requireAuth(request);
      const pool = await getPool();
      const result = await pool.request().query(`
        SELECT id, pig_id AS pigId, [date], [type], sale_price AS salePrice,
               sale_weight AS saleWeight, litter_size AS litterSize, notes,
               created_at AS createdAt
        FROM events
        ORDER BY [date] DESC, created_at DESC
      `);
      return { status: 200, jsonBody: result.recordset };
    } catch (error) {
      return { status: 500, jsonBody: { error: 'Failed to fetch events', detail: error.message } };
    }
  }
});

app.http('createEvent', {
  route: 'events',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: async (request) => {
    let tx;
    try {
      requireAuth(request);
      const body = await request.json();
      const { pigId, date, type, notes, salePrice, saleWeight, litterSize, sourceLocalId } = body || {};

      if (!pigId || !date || !type) {
        return { status: 400, jsonBody: { error: 'pigId, date, and type are required' } };
      }

      tx = new sql.Transaction(await getPool());
      await tx.begin();

      if (sourceLocalId) {
        const existing = await new sql.Request(tx)
          .input('sourceLocalId', sql.NVarChar(120), sourceLocalId)
          .query(`
            SELECT id, pig_id AS pigId, [date], [type], sale_price AS salePrice,
                   sale_weight AS saleWeight, litter_size AS litterSize, notes,
                   created_at AS createdAt
            FROM events
            WHERE source_local_id = @sourceLocalId
          `);
        if (existing.recordset.length) {
          await tx.commit();
          return { status: 200, jsonBody: existing.recordset[0] };
        }
      }

      const req = new sql.Request(tx);
      req.input('pigId', sql.UniqueIdentifier, pigId);
      req.input('date', sql.Date, date);
      req.input('type', sql.NVarChar(30), type);
      req.input('sourceLocalId', sql.NVarChar(120), sourceLocalId || null);
      req.input('notes', sql.NVarChar(sql.MAX), notes || null);
      req.input('salePrice', sql.Decimal(18, 2), Number(salePrice || 0));
      req.input('saleWeight', sql.Decimal(10, 2), Number(saleWeight || 0));
      req.input('litterSize', sql.Int, Number(litterSize || 0));

      const inserted = await req.query(`
        INSERT INTO events (pig_id, [date], [type], source_local_id, notes, sale_price, sale_weight, litter_size, created_at)
        OUTPUT INSERTED.id, INSERTED.pig_id AS pigId, INSERTED.[date], INSERTED.[type],
               INSERTED.notes, INSERTED.sale_price AS salePrice, INSERTED.sale_weight AS saleWeight,
               INSERTED.litter_size AS litterSize, INSERTED.created_at AS createdAt
        VALUES (@pigId, @date, @type, @sourceLocalId, @notes,
                CASE WHEN @type = 'sold' THEN @salePrice ELSE NULL END,
                CASE WHEN @type = 'sold' THEN @saleWeight ELSE NULL END,
                CASE WHEN @type = 'farrowed' THEN @litterSize ELSE NULL END,
                SYSUTCDATETIME())
      `);

      if (type === 'sold') {
        await new sql.Request(tx)
          .input('pigId', sql.UniqueIdentifier, pigId)
          .query("UPDATE pigs SET status = 'sold' WHERE id = @pigId");

        if (Number(salePrice || 0) > 0) {
          const eventId = inserted.recordset[0]?.id;
          const pigRes = await new sql.Request(tx)
            .input('pigId', sql.UniqueIdentifier, pigId)
            .query('SELECT tag, name FROM pigs WHERE id = @pigId');

          const pig = pigRes.recordset[0] || {};
          const pigLabel = pig.name ? `${pig.tag} (${pig.name})` : (pig.tag || 'Unknown Pig');

          await new sql.Request(tx)
            .input('date', sql.Date, date)
            .input('amount', sql.Decimal(18, 2), Number(salePrice || 0))
            .input('desc', sql.NVarChar(255), `Sale of pig ${pigLabel}`)
            .input('sourceLocalId', sql.NVarChar(120), eventId ? `event-sale:${eventId}` : null)
            .query(`
              INSERT INTO transactions ([date], [type], category, [description], amount, [method], [ref], source_local_id, created_at)
              VALUES (@date, 'income', 'pig-sales', @desc, @amount, 'cash', '', @sourceLocalId, SYSUTCDATETIME())
            `);
        }
      }
      if (type === 'dead') {
        await new sql.Request(tx)
          .input('pigId', sql.UniqueIdentifier, pigId)
          .query("UPDATE pigs SET status = 'dead' WHERE id = @pigId");
      }

      await tx.commit();
      return { status: 201, jsonBody: inserted.recordset[0] };
    } catch (error) {
      try { if (tx) await tx.rollback(); } catch {}
      return { status: 500, jsonBody: { error: 'Failed to create event', detail: error.message } };
    }
  }
});
