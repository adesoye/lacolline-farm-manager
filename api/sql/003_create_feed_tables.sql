IF OBJECT_ID('feed_logs', 'U') IS NULL
BEGIN
  CREATE TABLE feed_logs (
    id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    [date] DATE NOT NULL,
    pig_id UNIQUEIDENTIFIER NOT NULL,
    feed_type NVARCHAR(40) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    cost_per_kg DECIMAL(18,2) NOT NULL DEFAULT 0,
    total_cost DECIMAL(18,2) NOT NULL DEFAULT 0,
    feeding_time NVARCHAR(20) NULL,
    notes NVARCHAR(MAX) NULL,
    source_local_id NVARCHAR(120) NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_feed_logs_pigs FOREIGN KEY (pig_id) REFERENCES pigs(id)
  );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_feed_logs_source_local_id' AND object_id = OBJECT_ID('feed_logs'))
BEGIN
  CREATE UNIQUE INDEX UQ_feed_logs_source_local_id ON feed_logs(source_local_id) WHERE source_local_id IS NOT NULL;
END
GO

IF OBJECT_ID('purchases', 'U') IS NULL
BEGIN
  CREATE TABLE purchases (
    id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    [date] DATE NOT NULL,
    feed_type NVARCHAR(40) NOT NULL,
    qty DECIMAL(10,2) NOT NULL,
    cost_per_kg DECIMAL(18,2) NOT NULL,
    total_cost DECIMAL(18,2) NOT NULL,
    supplier NVARCHAR(120) NULL,
    notes NVARCHAR(MAX) NULL,
    reorder_level DECIMAL(10,2) NULL,
    source_local_id NVARCHAR(120) NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_purchases_source_local_id' AND object_id = OBJECT_ID('purchases'))
BEGIN
  CREATE UNIQUE INDEX UQ_purchases_source_local_id ON purchases(source_local_id) WHERE source_local_id IS NOT NULL;
END
GO
