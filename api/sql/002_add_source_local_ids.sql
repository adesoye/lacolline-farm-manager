IF COL_LENGTH('pigs', 'source_local_id') IS NULL
BEGIN
  ALTER TABLE pigs ADD source_local_id NVARCHAR(120) NULL;
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_pigs_source_local_id' AND object_id = OBJECT_ID('pigs'))
BEGIN
  CREATE UNIQUE INDEX UQ_pigs_source_local_id ON pigs(source_local_id) WHERE source_local_id IS NOT NULL;
END
GO

IF COL_LENGTH('events', 'source_local_id') IS NULL
BEGIN
  ALTER TABLE events ADD source_local_id NVARCHAR(120) NULL;
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_events_source_local_id' AND object_id = OBJECT_ID('events'))
BEGIN
  CREATE UNIQUE INDEX UQ_events_source_local_id ON events(source_local_id) WHERE source_local_id IS NOT NULL;
END
GO

IF COL_LENGTH('weights', 'source_local_id') IS NULL
BEGIN
  ALTER TABLE weights ADD source_local_id NVARCHAR(120) NULL;
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_weights_source_local_id' AND object_id = OBJECT_ID('weights'))
BEGIN
  CREATE UNIQUE INDEX UQ_weights_source_local_id ON weights(source_local_id) WHERE source_local_id IS NOT NULL;
END
GO

IF COL_LENGTH('transactions', 'source_local_id') IS NULL
BEGIN
  ALTER TABLE transactions ADD source_local_id NVARCHAR(120) NULL;
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_transactions_source_local_id' AND object_id = OBJECT_ID('transactions'))
BEGIN
  CREATE UNIQUE INDEX UQ_transactions_source_local_id ON transactions(source_local_id) WHERE source_local_id IS NOT NULL;
END
GO
